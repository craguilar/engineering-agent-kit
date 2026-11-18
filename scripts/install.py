#!/usr/bin/env python3
"""Install software-delivery skill and native subagents for Codex, Claude, Cursor.

No dependencies beyond Python's standard library. No network calls. No CLI execution.
"""
from __future__ import annotations

import argparse
import datetime as dt
import shutil
import sys
from pathlib import Path

from kit import PROVIDERS, deployment_files


def run(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scope", choices=("global", "project"), default="global")
    parser.add_argument("--project", type=Path, default=Path.cwd(), help="Target repository when --scope project")
    parser.add_argument("--agents", nargs="+", choices=PROVIDERS, default=list(PROVIDERS))
    parser.add_argument("--home", type=Path, default=Path.home(), help=argparse.SUPPRESS)
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing anything")
    parser.add_argument("--verify", action="store_true", help="Check installed files match canonical sources")
    parser.add_argument("--force", action="store_true", help="Back up and replace differing existing files")
    args = parser.parse_args(argv)

    if args.verify and args.force:
        parser.error("--verify and --force cannot be combined")
    if args.scope == "project" and not args.project.is_dir():
        parser.error(f"Project directory does not exist: {args.project}")
    target_root = (args.home if args.scope == "global" else args.project).expanduser().resolve()
    outputs: dict[Path, bytes] = {}
    for agent in dict.fromkeys(args.agents):
        for path, content in deployment_files(target_root, agent).items():
            if path in outputs and outputs[path] != content:
                raise ValueError(f"Two providers would write different data to {path}")
            outputs[path] = content

    matching, missing, different = [], [], []
    for path, content in sorted(outputs.items()):
        if not path.exists():
            missing.append(path)
        elif not path.is_file() or path.read_bytes() != content:
            different.append(path)
        else:
            matching.append(path)

    if args.verify:
        for path in missing:
            print("MISSING:", path)
        for path in different:
            print("DIFFERENT:", path)
        print(f"Verified {len(matching)}/{len(outputs)} matching files for {', '.join(args.agents)}")
        return 0 if not missing and not different else 1
    if args.dry_run:
        for path in missing:
            print("WOULD INSTALL:", path)
        for path in different:
            print("WOULD REPLACE:" if args.force else "COLLISION:", path)
        print(f"{len(missing)} missing, {len(different)} different, {len(matching)} already current")
        return 0 if args.force or not different else 2
    if different and not args.force:
        print("Refusing to overwrite these existing nonmatching files:", file=sys.stderr)
        for path in different:
            print(" -", path, file=sys.stderr)
        print("No files changed. Use --force to back up and replace them.", file=sys.stderr)
        return 2

    # Validate all target paths before touching any content.
    for path in outputs:
        if path.parent.exists() and not path.parent.is_dir():
            print(f"Target parent is not a directory: {path.parent}", file=sys.stderr)
            return 2

    backup_suffix = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    for path in different:
        backup = path.with_name(path.name + ".bak." + backup_suffix)
        if path.is_file():
            shutil.copy2(path, backup)
            print("BACKUP:", backup)
        else:
            print(f"Refusing to replace non-file path: {path}", file=sys.stderr)
            return 2
    for path in sorted(missing + different):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(outputs[path])
        print("INSTALLED:", path)
    print(f"Finished: {len(missing)} installed, {len(different)} updated, {len(matching)} already current.")
    print("Restart Codex / Claude Code / Cursor sessions to discover the installed skill and subagents.")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
