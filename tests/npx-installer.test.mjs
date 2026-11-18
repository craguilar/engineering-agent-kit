import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin', 'engineering-agent-kit.mjs');

function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-kit-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const project = path.join(home, 'some-project');
  fs.mkdirSync(project);
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
  const local = (...args) => run('--scope', 'project', '--project', project, ...args);
  return { home, project, run, local };
}

function success(result) {
  assert.equal(result.status, 0, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

test('help includes global and project no-clone examples', (t) => {
  const { run } = fixture(t);
  const r = run('--help');
  success(r);
  assert.match(r.stdout, /npx -y github:craguilar\/engineering-agent-kit --scope global/);
});

test('project install deploys skill + five native agents to all three tools and verifies', (t) => {
  const { project, local } = fixture(t);
  success(local());
  for (const [provider, ext] of [['codex', 'toml'], ['claude', 'md'], ['cursor', 'md']]) {
    const dirs = fs.readdirSync(path.join(project, `.${provider}`, 'agents'));
    assert.equal(dirs.length, 5);
    assert.ok(dirs.every((x) => x.endsWith(`.${ext}`)));
  }
  for (const rel of [
    '.agents/skills/software-delivery/SKILL.md',
    '.claude/skills/software-delivery/SKILL.md',
    '.cursor/skills/software-delivery/SKILL.md',
  ]) {
    assert.ok(fs.existsSync(path.join(project, rel)), rel);
  }
  success(local('--verify'));
  success(local()); // idempotent
});

test('global installation is isolated and installs selected providers', (t) => {
  const { home, run } = fixture(t);
  success(run('--scope', 'global', '--home', home, '--agents', 'codex', 'cursor'));
  assert.ok(fs.existsSync(path.join(home, '.codex/agents/delivery-planner.toml')));
  assert.ok(fs.existsSync(path.join(home, '.cursor/agents/delivery-reviewer.md')));
  assert.ok(fs.existsSync(path.join(home, '.agents/skills/software-delivery/SKILL.md')));
  assert.equal(fs.existsSync(path.join(home, '.claude')), false);
  success(run('--scope', 'global', '--home', home, '--agents', 'codex', 'cursor', '--verify'));
});

test('dry-run writes nothing; verify reports missing files', (t) => {
  const { project, local } = fixture(t);
  success(local('--dry-run'));
  assert.equal(fs.readdirSync(project).length, 0);
  const verify = local('--verify');
  assert.equal(verify.status, 1);
  assert.match(verify.stdout, /MISSING:/);
});

test('collisions are atomic; force backs up before replacement', (t) => {
  const { project, local } = fixture(t);
  const file = path.join(project, '.codex/agents/delivery-reviewer.toml');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'custom reviewer\n');
  const r = local('--agents', 'codex');
  assert.equal(r.status, 2);
  assert.equal(fs.readFileSync(file, 'utf8'), 'custom reviewer\n');
  assert.equal(fs.existsSync(path.join(project, '.codex/agents/delivery-planner.toml')), false);
  success(local('--agents', 'codex', '--force'));
  success(local('--agents', 'codex', '--verify'));
  const backups = fs.readdirSync(path.dirname(file)).filter((x) => x.startsWith('delivery-reviewer.toml.bak.'));
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(path.dirname(file), backups[0]), 'utf8'), 'custom reviewer\n');
});

test('rejects symlink destinations even with --force', (t) => {
  const { project, local } = fixture(t);
  const outside = path.join(path.dirname(project), 'outside');
  fs.writeFileSync(outside, 'sensitive');
  const file = path.join(project, '.codex/agents/delivery-planner.toml');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.symlinkSync(outside, file);
  const r = local('--agents', 'codex', '--force');
  assert.equal(r.status, 2);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'sensitive');
  assert.equal(fs.existsSync(path.join(project, '.codex/agents/delivery-implementer.toml')), false);
});

test('refuses unknown providers and missing projects', (t) => {
  const { home, run, local } = fixture(t);
  assert.equal(local('--agents', 'unknown').status, 2);
  assert.equal(local('--verify', '--force').status, 2);
  assert.equal(run('--scope', 'project', '--project', path.join(home, 'no-such-project')).status, 2);
});

test('all adapter files packaged by source match generated adapters', (t) => {
  const { project, local } = fixture(t);
  success(local());
  for (const [provider, ext] of [['codex', 'toml'], ['claude', 'md'], ['cursor', 'md']]) {
    const dir = path.join(root, 'adapters', provider, 'agents');
    for (const filename of fs.readdirSync(dir)) {
      assert.ok(filename.endsWith(`.${ext}`));
      const original = fs.readFileSync(path.join(dir, filename));
      const installed = fs.readFileSync(path.join(project, `.${provider}`, 'agents', filename));
      assert.ok(original.equals(installed));
    }
  }
});
