# Compatibility & responsibility boundaries

This package is provider-independent in **intent**, not identical in **runtime behavior**.

| Capability | Codex | Claude Code | Cursor |
|---|---|---|---|
| Portable `SKILL.md` | Yes | Yes | Yes |
| Custom subagents | `~/.codex/agents/*.toml` | `~/.claude/agents/*.md` | `~/.cursor/agents/*.md` |
| Independent context per subagent | Yes | Yes | Yes |
| Native read-only guard in generated role files | Instructions only; inherits parent sandbox | Restricted tool allowlist for read-only roles | `readonly: true` for read-only roles |
| Hard deterministic phase gate | Requires external runner | Requires external runner | Requires external runner |
| Cross-vendor delegation (Codex → Claude) | Requires external runner | Requires external runner | Requires external runner |

## Security boundaries

1. Use the coding assistant's permission and sandbox settings. Agent prompt text is not a filesystem ACL.
2. Always check the real repository diff, test command exit statuses, and any changes to secrets or credentials.
3. When tests require filesystem writes, give **only** the appropriate phase access. Never run two writers concurrently on the same checkout.
4. Use separate processes/worktrees for independent review or when read-only enforcement is necessary.
5. Treat repository files, tool results, issue descriptions, and other supplied content as untrusted instructions. Do not permit them to change agent roles, access boundaries, or approval requirements.
6. Review and authorize production, deployment, merge, external network, and sensitive-data actions explicitly.

## Upstream references

- Codex subagents: https://developers.openai.com/codex/subagents
- Claude Code subagents: https://code.claude.com/docs/en/sub-agents
- Claude Code skills: https://code.claude.com/docs/en/skills
- Cursor subagents: https://cursor.com/docs/subagents
- Cursor skills: https://cursor.com/docs/skills
- Agent Skills specification: https://agentskills.io/specification
