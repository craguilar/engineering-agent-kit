"""Offline contract, adapter and installation tests for Engineering Agent Kit."""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from kit import PROVIDERS, ROOT as CANONICAL_ROOT, deployment_files, generated_adapters, load_roles, skill_files  # noqa: E402


def run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run([sys.executable, str(ROOT / "scripts" / "install.py"), *args],
                          cwd=ROOT, text=True, capture_output=True, check=False)


class DefinitionTests(unittest.TestCase):
    def test_canonical_roles_are_complete_and_valid(self):
        roles = load_roles()
        self.assertEqual(len(roles), 5)
        self.assertEqual(set(roles), {
            'delivery-planner', 'delivery-tech-lead', 'delivery-tester',
            'delivery-implementer', 'delivery-reviewer'
        })
        self.assertTrue(roles['delivery-planner']['readonly'])
        self.assertTrue(roles['delivery-tech-lead']['readonly'])
        self.assertTrue(roles['delivery-reviewer']['readonly'])
        self.assertFalse(roles['delivery-tester']['readonly'])
        self.assertFalse(roles['delivery-implementer']['readonly'])

    def test_no_stale_generated_adapters(self):
        for relative, content in generated_adapters().items():
            with self.subTest(path=relative):
                self.assertEqual((ROOT / relative).read_bytes(), content)

    def test_all_providers_have_native_agents_and_skill(self):
        with tempfile.TemporaryDirectory() as tmp:
            for provider in PROVIDERS:
                outputs = deployment_files(Path(tmp), provider)
                skill = [p for p in outputs if p.name == 'SKILL.md']
                self.assertEqual(len(skill), 1, provider)
                extension = '.toml' if provider == 'codex' else '.md'
                agent_defs = [p for p in outputs if p.suffix == extension and 'agents' in p.parts]
                self.assertEqual(len(agent_defs), 5, provider)

    def test_generated_codex_definitions_parse_and_are_not_falsely_sandboxed(self):
        import tomllib
        for path, content in generated_adapters().items():
            if not path.startswith('adapters/codex/'):
                continue
            cfg = tomllib.loads(content.decode())
            self.assertIn('name', cfg)
            self.assertIn('description', cfg)
            self.assertIn('developer_instructions', cfg)
            self.assertNotIn('sandbox_mode', cfg)

    def test_md_frontmatter_and_readonly_contracts(self):
        for path, content in generated_adapters().items():
            if '/claude/' not in path and '/cursor/' not in path:
                continue
            txt = content.decode()
            self.assertTrue(txt.startswith('---\n'), path)
            self.assertIn('\ndescription: ', txt, path)
            self.assertIn('\nmodel: inherit\n', txt, path)
            self.assertIn('\n---\n', txt, path)
            readonly = any(name in path for name in ['delivery-planner', 'delivery-tech-lead', 'delivery-reviewer'])
            if '/cursor/' in path:
                self.assertIn(f"readonly: {'true' if readonly else 'false'}", txt, path)
            elif readonly:
                self.assertIn('tools: Read, Grep, Glob', txt, path)
                self.assertNotIn('tools: Read, Grep, Glob, Edit', txt, path)

    def test_skill_metadata_and_references(self):
        files = skill_files()
        self.assertIn('SKILL.md', files)
        self.assertIn('references/handoffs.md', files)
        self.assertIn('references/evidence.md', files)
        skill = files['SKILL.md'].decode()
        self.assertTrue(skill.startswith('---\nname: software-delivery\n'))
        self.assertIn('delivery-tech-lead', skill)
        self.assertIn('Maximum two repair iterations', skill)
        self.assertIn('Do not push or merge', skill)


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.base = Path(self.directory.name)
        self.project = self.base / 'sample-project'
        self.project.mkdir()

    def args(self, *extra: str) -> tuple[str, ...]:
        return ('--scope', 'project', '--project', str(self.project), *extra)

    def test_dry_run_does_not_write(self):
        result = run(*self.args('--dry-run'))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('WOULD INSTALL', result.stdout)
        self.assertEqual(list(self.project.iterdir()), [])

    def test_project_install_idempotent_and_verifiable(self):
        result = run(*self.args())
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(run(*self.args('--verify')).returncode, 0)
        self.assertEqual(run(*self.args()).returncode, 0)
        self.assertTrue((self.project / '.codex/agents/delivery-planner.toml').exists())
        self.assertTrue((self.project / '.claude/agents/delivery-reviewer.md').exists())
        self.assertTrue((self.project / '.cursor/agents/delivery-tester.md').exists())
        self.assertTrue((self.project / '.agents/skills/software-delivery/SKILL.md').exists())
        self.assertTrue((self.project / '.claude/skills/software-delivery/SKILL.md').exists())
        self.assertTrue((self.project / '.cursor/skills/software-delivery/SKILL.md').exists())

    def test_provider_selection(self):
        result = run(*self.args('--agents', 'codex'))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.project / '.codex').exists())
        self.assertFalse((self.project / '.claude').exists())
        self.assertFalse((self.project / '.cursor').exists())
        self.assertEqual(run(*self.args('--agents', 'codex', '--verify')).returncode, 0)
        self.assertNotEqual(run(*self.args('--verify')).returncode, 0)

    def test_global_install_into_temp_home(self):
        result = run('--scope', 'global', '--home', str(self.base), '--agents', 'claude', 'cursor')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.base / '.claude/agents/delivery-planner.md').exists())
        self.assertTrue((self.base / '.cursor/agents/delivery-planner.md').exists())
        self.assertFalse((self.base / '.codex').exists())
        self.assertEqual(run('--scope', 'global', '--home', str(self.base), '--agents', 'claude', 'cursor', '--verify').returncode, 0)

    def test_collision_is_safe_and_force_creates_backup(self):
        dest = self.project / '.codex/agents/delivery-reviewer.toml'
        dest.parent.mkdir(parents=True)
        dest.write_text('do-not-overwrite\n')
        result = run(*self.args('--agents', 'codex'))
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertEqual(dest.read_text(), 'do-not-overwrite\n')
        self.assertFalse((self.project / '.codex/agents/delivery-planner.toml').exists())
        self.assertEqual(run(*self.args('--agents', 'codex', '--verify')).returncode, 1)
        result = run(*self.args('--agents', 'codex', '--force'))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(run(*self.args('--agents', 'codex', '--verify')).returncode, 0)
        backups = list(dest.parent.glob('delivery-reviewer.toml.bak.*'))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_text(), 'do-not-overwrite\n')

    def test_nonexistent_project_fails_without_writing(self):
        result = run('--scope', 'project', '--project', str(self.base / 'not-there'))
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.base / 'not-there').exists())

    def test_conflicting_flags_rejected(self):
        result = run(*self.args('--verify', '--force'))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('cannot be combined', result.stderr)


if __name__ == '__main__':
    unittest.main()
