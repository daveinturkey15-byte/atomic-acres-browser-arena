"""Focused no-publication contract tests. All publisher side effects are fail-fast spies."""
import importlib.util
import json
import pathlib
import subprocess
import unittest
from unittest.mock import patch, Mock

path = pathlib.Path(__file__).with_name('publish_pass96.py')
spec = importlib.util.spec_from_file_location('publisher', path)
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class HandoffBoundary(unittest.TestCase):
    def test_missing_or_failed_proof_stops_before_build_and_outward_mutations(self):
        for error in ('missing record', 'stale HEAD', 'forged receipt', 'failed checker'):
            with self.subTest(error=error), patch.object(publisher, 'require_capability_handoff', side_effect=SystemExit(error)), \
                    patch.object(publisher, 'checkout_gh_pages') as checkout, \
                    patch.object(publisher, 'commit_and_push') as publish, \
                    patch.object(publisher, 'assert_build_is_not_stale') as build:
                with self.assertRaisesRegex(SystemExit, error):
                    publisher.main([])
                checkout.assert_not_called()
                publish.assert_not_called()
                build.assert_not_called()

    def test_local_dry_run_does_not_request_capability_or_checkout(self):
        with patch.object(publisher, 'require_capability_handoff') as gate, \
                patch.object(publisher, 'checkout_gh_pages') as checkout, \
                patch.object(publisher, 'dry_run', return_value=2) as plan:
            self.assertEqual(publisher.main(['--dry-run', '--gh-pages-dir', str(path.parent)]), 2)
            gate.assert_not_called()
            checkout.assert_not_called()
            plan.assert_called_once_with(str(path.parent.resolve()), None, rollback=False)

    def test_rollback_preservation_stays_independent(self):
        with patch.object(publisher, 'require_capability_handoff') as gate, \
                patch.object(publisher, 'checkout_gh_pages', return_value='fixture') as checkout, \
                patch.object(publisher, 'read_shell_sources', return_value={}), \
                patch.object(publisher, 'rollback', return_value=0) as rollback:
            self.assertEqual(publisher.main(['--rollback']), 0)
            gate.assert_not_called()
            checkout.assert_called_once()
            rollback.assert_called_once_with('fixture', {})

    def test_valid_live_gate_precedes_other_publish_guards(self):
        with patch.object(publisher, 'require_capability_handoff') as gate, \
                patch.object(publisher.os.path, 'isdir', return_value=True), \
                patch.object(publisher, 'assert_build_is_not_stale', side_effect=RuntimeError('next guard')), \
                patch.object(publisher, 'checkout_gh_pages') as checkout:
            with self.assertRaisesRegex(RuntimeError, 'next guard'):
                publisher.main([])
            gate.assert_called_once()
            checkout.assert_not_called()

    def test_adapter_demands_success_and_structured_live_proof(self):
        good = {'ok': True, 'capabilityHandoff': {'headSha': 'a' * 40, 'records': [{'id': 'fixture'}]}}
        for status, stdout in [(1, json.dumps(good)), (0, '{}'), (0, 'GREEN'), (3, json.dumps(good))]:
            with self.subTest(status=status, stdout=stdout), patch.object(publisher.subprocess, 'run',
                    return_value=subprocess.CompletedProcess([], status, stdout, '')):
                with self.assertRaises(SystemExit):
                    publisher.require_capability_handoff()
        with patch.object(publisher.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, json.dumps(good), '')) as run:
            self.assertEqual(publisher.require_capability_handoff(), good['capabilityHandoff'])
            args, kwargs = run.call_args
            self.assertEqual(args[0], ['node', str(path.parents[1] / 'release' / 'capability-handoff-check.mjs')])
            self.assertEqual(kwargs['cwd'], publisher.SRC)


if __name__ == '__main__':
    unittest.main()
