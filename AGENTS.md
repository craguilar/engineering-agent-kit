# Engineering Agent Kit repository conventions

- Python 3.11+ and Node.js 20+ for the respective installers and tests; standard libraries only.
- The installers do not themselves fetch remote content or run AI tools. `npx` handles GitHub package retrieval before running the Node installer.
- `agents/roles.json` and `agents/*.md` are the canonical role definitions.
- Never manually edit generated `adapters/` files. Run `python3 scripts/render_adapters.py --write` instead.
- Check reproducibility: `python3 scripts/render_adapters.py --check`.
- Run `python3 -m unittest discover -s tests -v` and `npm test` for every change.
- Preserve existing target files unless the user explicitly selects `--force`.
- Never automatically push, merge, deploy, or modify credentials.
