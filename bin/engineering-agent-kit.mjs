#!/usr/bin/env node
/** Install the shared software-delivery skill and native agents without cloning the repo. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROVIDERS = ['codex', 'claude', 'cursor'];

function usage() {
  return `Engineering Agent Kit — install the skill and all five native agents.

Usage: engineering-agent-kit [options]

Options:
  --scope global|project    Install globally (default) or into a project
  --project <path>          Project directory (default: current directory)
  --agents <names...>      Tools to configure (default: codex claude cursor)
  --dry-run                Show changes without writing files
  --verify                 Verify the installed files match this kit
  --force                  Back up and replace conflicting files
  -h, --help               Show this help

Examples:
  npx -y github:craguilar/engineering-agent-kit --scope global
  npx -y github:craguilar/engineering-agent-kit --scope project --project .
`;
}

function parseArgs(argv) {
  const args = {
    scope: 'global',
    project: process.cwd(),
    home: os.homedir(),
    agents: [...PROVIDERS],
    dryRun: false,
    verify: false,
    force: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--verify') args.verify = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--scope' || arg === '--project' || arg === '--home') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      args[{ '--scope': 'scope', '--project': 'project', '--home': 'home' }[arg]] = value;
    } else if (arg === '--agents') {
      const values = [];
      while (i + 1 < argv.length && !argv[i + 1].startsWith('-')) values.push(argv[++i]);
      if (!values.length) throw new Error('Provide at least one name after --agents');
      for (const provider of values) {
        if (!PROVIDERS.includes(provider)) throw new Error(`Unknown agent: ${provider}`);
      }
      args.agents = [...new Set(values)];
    } else throw new Error(`Unknown option: ${arg}`);
  }
  if (!['global', 'project'].includes(args.scope)) throw new Error('--scope must be global or project');
  if (args.verify && args.force) throw new Error('--verify and --force cannot be combined');
  return args;
}

function sourceFiles(root) {
  const files = [];
  function walk(dir, relative = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const next = path.join(dir, entry.name);
      const rel = path.join(relative, entry.name);
      if (entry.isDirectory()) walk(next, rel);
      else if (entry.isFile()) files.push([rel, next]);
      else throw new Error(`Unexpected non-file in package: ${next}`);
    }
  }
  walk(root);
  return files;
}

function deploymentFiles(targetRoot, providers) {
  const outputs = new Map();
  const skill = sourceFiles(path.join(PACKAGE_ROOT, 'skills', 'software-delivery'));
  for (const provider of providers) {
    const skillDir = provider === 'codex'
      ? path.join('.agents', 'skills', 'software-delivery')
      : path.join(`.${provider}`, 'skills', 'software-delivery');
    for (const [rel, src] of skill) {
      const dest = path.join(targetRoot, skillDir, rel);
      const previous = outputs.get(dest);
      if (previous && previous !== src) throw new Error(`Conflicting files for ${dest}`);
      outputs.set(dest, src);
    }
    for (const [rel, src] of sourceFiles(path.join(PACKAGE_ROOT, 'adapters', provider, 'agents'))) {
      outputs.set(path.join(targetRoot, `.${provider}`, 'agents', rel), src);
    }
  }
  return [...outputs].sort(([a], [b]) => a.localeCompare(b));
}

function inspect(dest, src) {
  try {
    const stat = fs.lstatSync(dest);
    if (!stat.isFile()) return 'unsafe'; // Never follow symlinks or replace directories.
    return fs.readFileSync(dest).equals(fs.readFileSync(src)) ? 'matching' : 'different';
  } catch (error) {
    if (error.code === 'ENOENT') return 'missing';
    throw error;
  }
}

function checkParentDirectories(dest, targetRoot) {
  let parent = path.dirname(dest);
  const stop = path.dirname(targetRoot);
  while (parent !== stop && parent !== path.dirname(parent)) {
    if (fs.existsSync(parent) && !fs.lstatSync(parent).isDirectory()) {
      throw new Error(`Parent is not a directory: ${parent}`);
    }
    parent = path.dirname(parent);
  }
}

function install(args) {
  const targetRoot = path.resolve(args.scope === 'global' ? args.home : args.project);
  if (args.scope === 'project' && (!fs.existsSync(targetRoot) || !fs.statSync(targetRoot).isDirectory())) {
    throw new Error(`Project directory does not exist: ${targetRoot}`);
  }
  const outputs = deploymentFiles(targetRoot, args.agents);
  const groups = { matching: [], missing: [], different: [], unsafe: [] };
  for (const [dest, src] of outputs) groups[inspect(dest, src)].push([dest, src]);
  const count = (name) => groups[name].length;
  const report = (name) => groups[name].forEach(([dest]) => console.log(`${name.toUpperCase()}: ${dest}`));

  if (args.verify) {
    report('missing'); report('different'); report('unsafe');
    console.log(`Verified ${count('matching')}/${outputs.length} files for ${args.agents.join(', ')}`);
    return count('missing') || count('different') || count('unsafe') ? 1 : 0;
  }
  if (args.dryRun) {
    report('missing');
    groups.different.forEach(([dest]) => console.log(`${args.force ? 'WOULD REPLACE' : 'COLLISION'}: ${dest}`));
    report('unsafe');
    console.log(`${count('missing')} missing, ${count('different')} different, ${count('matching')} current`);
    return count('unsafe') || (count('different') && !args.force) ? 2 : 0;
  }
  if (count('unsafe')) {
    report('unsafe');
    throw new Error('Refusing to write to non-file/symlink targets');
  }
  if (count('different') && !args.force) {
    report('different');
    throw new Error('Existing files differ. Nothing changed. Pass --force to back up and replace them.');
  }
  for (const [dest] of outputs) checkParentDirectories(dest, targetRoot);

  const suffix = `.bak.${new Date().toISOString().replace(/[-:.]/g, '')}.${process.pid}`;
  for (const [dest] of groups.different) {
    const backup = dest + suffix;
    fs.copyFileSync(dest, backup, fs.constants.COPYFILE_EXCL);
    console.log(`BACKUP: ${backup}`);
  }
  for (const [dest, src] of [...groups.missing, ...groups.different]) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log(`INSTALLED: ${dest}`);
  }
  console.log(`Done: ${count('missing')} installed, ${count('different')} updated, ${count('matching')} already current.`);
  console.log('Start a new Codex, Claude Code, or Cursor session to use the software-delivery skill.');
  return 0;
}

try {
  const args = parseArgs(process.argv.slice(2));
  process.exitCode = args.help ? (console.log(usage()), 0) : install(args);
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 2;
}
