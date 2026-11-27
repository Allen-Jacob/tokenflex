import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import codexbar
import usage


class AccountingTests(unittest.TestCase):
    def report(self, cost=1.5):
        return [{'provider':'codex','source':'local','currencyCode':'USD',
                 'daily':[{'date':'2026-11-26','inputTokens':1000,'outputTokens':100,
                           'cacheReadTokens':900,'reasoningTokens':50,'totalCost':cost,
                           'modelBreakdowns':[{'modelName':'example','totalTokens':1100,'cost':cost}]}],
                 # These overlap with daily and must never be added to it.
                 'projects':[{'totalCost':1.5}], 'totals':{'totalCost':1.5}}]

    def test_use_daily_only_without_repricing_or_reasoning_double_count(self):
        rows=codexbar.normalize(self.report())['records']
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['costUSD'],1.5)
        self.assertEqual(rows[0]['input']+rows[0]['output'],1100)
        self.assertEqual(rows[0]['cached'],900)

    def test_unknown_cost_stays_unknown(self):
        self.assertIsNone(codexbar.normalize(self.report(None))['records'][0]['costUSD'])

    def test_bad_report_is_rejected(self):
        with self.assertRaises(ValueError): codexbar.normalize([])
        report=self.report();report[0]['daily']*=2
        with self.assertRaises(ValueError): codexbar.normalize(report)

    def test_refresh_replaces_days_and_failure_keeps_last_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(usage,'DATABASE',Path(tmp)/'usage.db'), patch.object(usage,'quota_snapshot',return_value={'windows':[]}):
            with patch.object(usage,'collect',return_value=codexbar.normalize(self.report())):
                first=usage.snapshot()
                self.assertEqual(usage.snapshot()['records'],first['records'])
            with patch.object(usage,'collect',return_value=codexbar.normalize(self.report(2))):
                self.assertEqual(usage.snapshot()['records'][0]['costUSD'],2)
            with patch.object(usage,'collect',side_effect=RuntimeError('missing')):
                stale=usage.snapshot()
                self.assertEqual(stale['status'],'stale')
                self.assertEqual(stale['records'][0]['costUSD'],2)

if __name__=='__main__': unittest.main()
