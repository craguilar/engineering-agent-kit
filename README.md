# Engineering Agent Kit

**One reusable software-delivery workflow for Codex CLI, Claude Code, and Cursor.**

Install it once to get the `software-delivery` skill **and five specialized agents**. Use them to plan, test, implement, validate, and review changes in your projects.

## Quick start

**Requirements:** Python 3.11+, Git, and at least one supported coding assistant (Codex CLI, Claude Code, or Cursor). No Python packages are needed.

### 1. Get the kit

```bash
git clone https://github.com/craguilar/engineering-agent-kit.git
cd engineering-agent-kit
```

### 2. Install for all your local projects

**Windows / PowerShell**

```powershell
py -3 scripts/install.py --scope global
py -3 scripts/install.py --scope global --verify
```

**macOS / Linux**

```bash
python3 scripts/install.py --scope global
python3 scripts/install.py --scope global --verify
```

This installs the shared skill and native agent definitions for **all three tools**. The `--verify` command checks that they were installed correctly.

### 3. Use it in any project

Open your project's folder and start a **new** Codex, Claude Code, or Cursor Agent session.

| Tool | How to start |
| --- | --- |
| Codex CLI | Run `codex` in your project |
| Claude Code | Run `claude` in your project |
| Cursor | Open the project and start an Agent chat |

Then ask:

```text
Use the software-delivery skill and its delivery agents to
implement <your feature or bug fix>.

Plan first, write tests, implement, run validation, and
perform an independent review. Do not push or merge.
```

In Claude Code you can also invoke `/software-delivery` directly. In Cursor, use that command if available or mention the skill by name.

## How it works

The coding assistant acts as the **orchestrator** and delegates each phase to a specialized agent.

```mermaid
flowchart TD
    U["Your request"] --> S["Software-delivery skill<br/>Orchestrator"]
    S --> P["1. Planner<br/>Plan and acceptance criteria"]
    P --> L["2. Tech Lead<br/>Challenge the approach"]
    L --> T["3. Tester<br/>Write behavioral tests"]
    T --> I["4. Implementer<br/>Make the tests pass"]
    I --> V["Run lint, tests, typecheck, build"]
    V --> R["5. Reviewer<br/>Independent code review"]
    R --> D{"Blocking findings?"}
    D -->|No| H["Final report<br/>Human approval"]
    D -->|Yes| F["Implementer fixes issues"]
    F --> V
    D -->|After 2 repair cycles| E["Report unresolved issues"]
```

The tester and implementer edit files **sequentially**. The planner, tech lead, and reviewer are intended to work without modifying code. The reviewer gets a fresh context. The workflow stops after two repair cycles and never pushes or merges without approval.

## Using it across projects

**Global installation** makes the skill and agents available to all projects on *your machine*:

```mermaid
flowchart TB
    K["engineering-agent-kit<br/>Single source of truth"] --> X["Global installer"]
    X --> C["Codex CLI<br/>Skill + native agents"]
    X --> A["Claude Code<br/>Skill + native agents"]
    X --> R["Cursor<br/>Skill + native agents"]
    C --> P["Any local project"]
    A --> P
    R --> P
```

For **team repositories, CI, or cloud agents**, install into the project instead and commit the generated configuration:

**Windows / PowerShell**

```powershell
py -3 scripts/install.py --scope project --project "C:/projects/my-app"
py -3 scripts/install.py --scope project --project "C:/projects/my-app" --verify
```

**macOS / Linux**

```bash
python3 scripts/install.py --scope project --project ~/projects/my-app
python3 scripts/install.py --scope project --project ~/projects/my-app --verify
```

This writes the skill and agent files into the project's `.agents/`, `.codex/`, `.claude/`, and `.cursor/` folders. It does **not** overwrite the project's `AGENTS.md` or `CLAUDE.md`.

## Useful commands

Run these from the **engineering-agent-kit** folder:

| Option | Purpose |
| --- | --- |
| `--agents codex` | Install for only Codex (also accepts `claude` and `cursor`) |
| `--dry-run` | Preview changes without writing files |
| `--verify` | Check installed files |
| `--force` | Back up and replace conflicting installed files |

For example: `python3 scripts/install.py --scope global --agents codex claude --dry-run`.

## Updating the shared workflow

Pull the latest kit and rerun the installer. Existing files are not overwritten silently; use `--dry-run` to inspect differences and `--force` to back up and replace installed files when you're ready.

If you maintain the kit, edit canonical files in `agents/`, then regenerate adapters and run tests:

```bash
python3 scripts/render_adapters.py --write
python3 scripts/render_adapters.py --check
python3 -m unittest discover -s tests -v
```

## Important limitations

This kit provides **skills and agent definitions**, not a standalone orchestration server. Each coding assistant runs its own native agents; installing the kit does **not** automatically make Codex invoke Claude Code or Cursor. Agent instructions alone do not enforce filesystem permissions (Codex subagents inherit the parent sandbox). For hard isolation or cross-vendor delegation, use a separate orchestrator.

See [compatibility and permissions](docs/compatibility.md) and the [workflow contract](skills/software-delivery/references/handoffs.md) for details.
