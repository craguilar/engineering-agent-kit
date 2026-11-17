# Engineering Agent Kit repository conventions

- Python 3.11+; standard library only. No install-time network calls.
- `agents/roles.json` and `agents/*.md` are the canonical role definitions.
- Never manually edit generated `adapters/` files. Run `python3 scripts/render_adapters.py --write` instead.
- Check reproducibility: `python3 scripts/render_adapters.py --check`.
- Run `python3 -m unittest discover -s tests -v` for every change.
- Preserve existing target files unless the user explicitly selects `--force`.
- Never automatically push, merge, deploy, or modify credentials.
