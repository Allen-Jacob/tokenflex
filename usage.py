"""Read only Codex usage counters. Persist local quotas and CodexBar daily accounting."""
import json
import os
import threading
import sqlite3
from codexbar import collect
from contextlib import closing
from collections import defaultdict
from datetime import datetime
from pathlib import Path

DATABASE = Path(__file__).resolve().parent / "data" / "usage.sqlite3"
lock = threading.Lock()


def summarize(path):
    rows = defaultdict(lambda: [0, 0, 0, 0])
    windows = {}
    model = 'Modèle inconnu'
    previous = None
    with path.open('rb') as stream:
        for line in stream:
            if b'"turn_context"' not in line[:160] and b'"token_count"' not in line[:250]:
                continue
            try:
                event = json.loads(line)
                payload = event['payload']
                if event['type'] == 'turn_context':
                    model = payload.get('model') or model
                    continue
                if payload.get('type') != 'token_count':
                    continue
                stamp = datetime.fromisoformat(event['timestamp'].replace('Z', '+00:00'))
                limits = payload.get('rate_limits') or {}
                if limits.get('limit_id') in (None, 'codex'):
                    for name in ('primary', 'secondary'):
                        w = limits.get(name) or {}
                        if isinstance(w.get('used_percent'), (int, float)) and w.get('resets_at'):
                            windows[name, w['resets_at']] = dict(time=stamp.timestamp(), used=w['used_percent'], reset=w['resets_at'], minutes=w.get('window_minutes'))
                total = (payload.get('info') or {}).get('total_token_usage')
                if not total:
                    continue
                current = (total['input_tokens'], total['output_tokens'],
                           total.get('cached_input_tokens', 0), total.get('reasoning_output_tokens', 0))
                last = payload['info'].get('last_token_usage') or {}
                if previous is None and last:
                    # A resumed or forked session can start with an inherited total.
                    delta = [last.get(k, 0) for k in ('input_tokens', 'output_tokens',
                             'cached_input_tokens', 'reasoning_output_tokens')]
                else:
                    delta = [max(0, a-b) for a, b in zip(current, previous or (0, 0, 0, 0))]
                previous = current
                if any(delta):
                    row = rows[stamp.astimezone().date().isoformat(), model]
                    for index, value in enumerate(delta):
                        row[index] += value
            except (ValueError, KeyError, TypeError):
                continue
    return rows, windows


def quota_snapshot():
    base = Path(os.environ.get('CODEX_HOME') or Path.home()/'.codex')
    DATABASE.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with lock, closing(sqlite3.connect(DATABASE, timeout=30)) as db, db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS files(name TEXT PRIMARY KEY, version INTEGER);
            CREATE TABLE IF NOT EXISTS usage(file TEXT, day TEXT, model TEXT, inp INTEGER,
                out INTEGER, cached INTEGER, reasoning INTEGER, PRIMARY KEY(file,day,model));
            CREATE TABLE IF NOT EXISTS quotas(name TEXT, reset INTEGER, time REAL, used REAL,
                minutes INTEGER, PRIMARY KEY(name,reset));
        """)
        for folder in ('sessions', 'archived_sessions'):
            for path in (base/folder).rglob('rollout-*.jsonl'):
                try:
                    version = path.stat().st_mtime_ns
                    if db.execute('SELECT version FROM files WHERE name=?', (path.name,)).fetchone() == (version,):
                        continue
                    rows, windows = summarize(path)
                except OSError:
                    continue
                db.execute('DELETE FROM usage WHERE file=?', (path.name,))
                db.executemany('INSERT OR REPLACE INTO usage VALUES(?,?,?,?,?,?,?)',
                               [(path.name, day, model, *values) for (day, model), values in rows.items()])
                for (name, reset), w in windows.items():
                    db.execute("""INSERT INTO quotas VALUES(?,?,?,?,?) ON CONFLICT(name,reset)
                        DO UPDATE SET time=excluded.time,used=excluded.used,minutes=excluded.minutes
                        WHERE excluded.time >= quotas.time""", (name, reset, w['time'], w['used'], w['minutes']))
                db.execute('INSERT OR REPLACE INTO files VALUES(?,?)', (path.name, version))
        records = []
        for day, model, inp, out, cached, reasoning in db.execute("""
                SELECT day,model,SUM(inp),SUM(out),SUM(cached),SUM(reasoning)
                FROM usage GROUP BY day,model ORDER BY day"""):
            records.append(dict(time=int(datetime.fromisoformat(day).timestamp()*1000), model=model,
                                input=inp, output=out, cached=min(inp,cached), reasoning=min(out,reasoning)))
        windows = [dict(reset=r,time=t,used=u,minutes=m) for r,t,u,m in
                   db.execute('SELECT reset,time,used,minutes FROM quotas')]
        return dict(records=records, windows=windows)


def snapshot():
    # Keep the native quota reader independent from the API-equivalent cost engine.
    quotas = quota_snapshot()['windows']
    with lock, closing(sqlite3.connect(DATABASE, timeout=30)) as db, db:
        db.execute('CREATE TABLE IF NOT EXISTS codexbar_days(day TEXT PRIMARY KEY, payload TEXT)')
        db.execute('CREATE TABLE IF NOT EXISTS codexbar_meta(id INTEGER PRIMARY KEY, payload TEXT)')
        try:
            result = collect()
        except (OSError, ValueError, RuntimeError, __import__('subprocess').SubprocessError):
            previous = db.execute('SELECT payload FROM codexbar_meta WHERE id=1').fetchone()
            result = json.loads(previous[0]) if previous else dict(engine='CodexBar', currency='USD')
            result['status'] = 'stale' if previous else 'unavailable'
            result['message'] = 'Calcul CodexBar indisponible. Relance CodexBar ou vérifie son installation.'
        else:
            for row in result.pop('records'):
                db.execute('INSERT OR REPLACE INTO codexbar_days VALUES(?,?)',
                           (row['day'], json.dumps(row)))
            result['status'] = 'ok'
            db.execute('INSERT OR REPLACE INTO codexbar_meta VALUES(1,?)', (json.dumps(result),))
        result['records'] = [json.loads(r[0]) for r in db.execute(
            'SELECT payload FROM codexbar_days ORDER BY day')]
        result['windows'] = quotas
        return result
