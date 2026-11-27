"""Local CodexBar adapter. Never reprice or sum overlapping report sections."""
import json
import math
import os
import shutil
import subprocess
from datetime import datetime
from pathlib import Path


def executable():
    candidates = [os.environ.get('TOKENFLEX_CODEXBAR'), shutil.which('codexbar'),
                  '/Applications/CodexBar.app/Contents/Helpers/CodexBarCLI']
    for candidate in candidates:
        if candidate and Path(candidate).is_file() and os.access(candidate, os.X_OK):
            return candidate
    raise RuntimeError('CodexBar introuvable. Installe CodexBar ou définis TOKENFLEX_CODEXBAR.')


def normalize(report):
    if not isinstance(report, list):
        raise ValueError('Format CodexBar inattendu')
    matches = [r for r in report if r.get('provider') == 'codex' and r.get('source') == 'local']
    if len(matches) != 1:
        raise ValueError('Un relevé Codex local est requis')
    source = matches[0]
    if source.get('currencyCode') != 'USD' or not isinstance(source.get('daily'), list):
        raise ValueError('Devise ou historique CodexBar inattendu')
    records = []
    for day in source['daily']:
        date = datetime.strptime(day['date'], '%Y-%m-%d')
        def count(key):
            value = day.get(key, 0)
            if not isinstance(value, int) or value < 0:
                raise ValueError('Compteur CodexBar invalide')
            return value
        amount = day.get('totalCost')
        if amount is not None and (not isinstance(amount, (int, float)) or not math.isfinite(amount) or amount < 0):
            raise ValueError('Coût CodexBar invalide')
        records.append(dict(day=day['date'], time=int(date.timestamp()*1000),
            input=count('inputTokens'), output=count('outputTokens'),
            cached=count('cacheReadTokens'), reasoning=count('reasoningTokens'),
            costUSD=amount, coverage=day.get('coverage', {}),
            models=day.get('modelBreakdowns', [])))
    if len({r['day'] for r in records}) != len(records):
        raise ValueError('Jours CodexBar en double')
    return dict(records=records, updatedAt=source.get('updatedAt'),
                currency='USD', engine='CodexBar', scope='Journaux locaux de ce Mac')


def collect():
    command = [executable(), 'cost', '--provider', 'codex', '--format', 'json', '--period', 'all']
    result = subprocess.run(command, capture_output=True, text=True, timeout=45, check=True)
    return normalize(json.loads(result.stdout))
