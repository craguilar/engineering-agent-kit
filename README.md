# Engineering Agent Kit

A portable, local-first software-delivery workflow for **Codex CLI, Claude Code, and Cursor**. One canonical set of role instructions is rendered into each tool's native subagent format, and one `software-delivery` skill coordinates the phases.

> **This kit installs instructions and agent definitions, not a long-running workflow engine.** Each coding assistant manages delegation in its own session. For hard-enforced sandbox permissions, deterministic phase gates, durable traces, or cross-vendor execution (e.g. Codex implementation followed by Claude review), add an external orchestrator.

## What's included

- Shared Agent Skills-compatible `skills/software-delivery/SKILL.md`.
- Five roles: `delivery-planner`, `delivery-tech-lead`, `delivery-tester`, `delivery-implementer`, and `delivery-reviewer`.
- Native agent definitions generated for Codex (`.toml`), Claude Code (`.md`) and Cursor (`.md`).
- Cross-platform Python installer (`scripts/install.py`) with PowerShell and shell wrappers.
- Global or per-project installation, idempotency checks, collision protection, dry run, and verification.
- Offline automated tests and a GitHub Actions check.

## Requirements

- Python 3.11+ for the installer and tests (standard library only).
- Recent versions of Codex CLI, Claude Code, and/or Cursor with subagent support.
- Git is optional for installation but required for the software-development workflow.

## Install globally (all local projects)

From this repository:

```powershell
py -3 scripts/install.py --scope global
py -3 scripts/install.py --scope global --verify
```

On macOS/Linux:

```bash
python3 scripts/install.py --scope global
python3 scripts/install.py --scope global --verify
```

The installer deploys **both** the skill **and** the agents:

| Tool | Skill | Agents |
| --- | --- | --- |
| Codex | `~/.agents/skills/software-delivery/` | `~/.codex/agents/delivery-*.toml` |
| Claude Code | `~/.claude/skills/software-delivery/` | `~/.claude/agents/delivery-*.md` |
| Cursor | `~/.cursor/skills/software-delivery/` | `~/.cursor/agents/delivery-*.md` |

These are native, per-tool locations. The kit does not change existing global CLI settings or grant additional permissions.

## Install in a specific project (recommended for teams and cloud agents)

```powershell
py -3 scripts/install.py --scope project --project "C:\projects\asset360-app"
py -3 scripts/install.py --scope project --project "C:\projects\asset360-app" --verify
```

On macOS/Linux:

```bash
python3 scripts/install.py --scope project --project ~/work/asset360-app
```

This writes the same files to the repo's `.agents/skills/`, `.claude/`, `.codex/`, and `.cursor/` directories. Commit these project-scoped files in the consuming project if you want every teammate and cloud agent to see them. Project instructions in `AGENTS.md` or `CLAUDE.md` remain owned by that project and are **not** overwritten.

Select a subset: `--agents codex claude` or `--agents cursor`. Use `--dry-run` to preview and `--verify` to compare installed files with the canonical source. Existing different files are never overwritten by default; `--force` backs them up before replacement.

## Use it

In your project's CLI/editor, **start a new session** after installation and request:

```
Use the software-delivery skill and its delivery-* agents to implement
<feature request>. Create acceptance criteria and tests first; use a
fresh read-only reviewer; run the project's actual validation commands;
stop after two repair iterations. Do not push or merge.
```

For Claude Code, `/software-delivery` explicitly invokes the skill. For Cursor, use `/software-delivery` when available or mention its name. In Codex, ask it to use the `software-delivery` skill and spawn the named agents.

### What happens

`request → planner → tech lead challenge → tester → implementer → validation → independent reviewer → bounded repairs → final report`

The tech lead is an architecture/quality challenge role, **not** another agent allowed to edit the implementation. The tester should provide screenshots or reproducible UI evidence when UI behavior is changed and capture tools are available. Only the tester and implementer are intended to modify files, sequentially.

## Maintain one source of truth

Edit `agents/roles.json` and `agents/<role>.md`, **not** the generated adapter files. Then run:

```bash
python3 scripts/render_adapters.py --write
python3 scripts/render_adapters.py --check
python3 -m unittest discover -s tests -v
```

PRs changing canonical role instructions should regenerate and review all three adapters together. `scripts/install.py` installs from these canonical definitions, and tests verify that the checked-in adapters match.

## Security & operational limitations

- Subagents can be instructed to work read-only, and Claude/Cursor configurations restrict their tools, but these are not a universal isolation boundary. Codex custom agents inherit the parent's sandbox permissions; use isolated processes/worktrees when enforcement is required.
- The parent must check actual command exit codes and the final diff, rather than trusting agents' claims.
- Never run multiple write-capable agents against the same worktree concurrently.
- The installer does **not** execute AI tools, fetch remote content, change `AGENTS.md`, push, open PRs, or manage credentials.
- Global files are local to the current machine. Remote/cloud agents generally need project-scoped files committed to source control or explicit environment setup.
- The workflow can collect a final activity summary, but guaranteed tool-by-tool audit logs require an external runtime or hooks.

See [compatibility and permissions](docs/compatibility.md) and [workflow contract](skills/software-delivery/references/handoffs.md).
