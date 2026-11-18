#!/usr/bin/env python3
"""Regenerate or verify provider-specific agent files from canonical sources."""
from __future__ import annotations

import argparse
import sys

from kit import ROOT, generated_adapters


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true", help="Write generated adapter definitions")
    mode.add_argument("--check", action="store_true", help="Check generated definitions match")
    args = parser.parse_args(argv)
    differences = []
    for rel, content in generated_adapters(ROOT).items():
        dest = ROOT / rel
        if args.write:
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(content)
            print("Wrote", rel)
        elif not dest.exists() or dest.read_bytes() != content:
            differences.append(rel)
    if differences:
        print("Stale or missing generated files:\n" + "\n".join(differences), file=sys.stderr)
        return 1
    if args.check:
        print("All generated adapters are current.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
