---
name: agent-runtime
description: Design, build, or review a production LLM tool-calling agent runtime with a bounded loop, tool registry, code-enforced guards, human approval, sessions, memory, quotas, audit, and offline evals. Use when adding an agent to an application or scaffolding a reusable agent template. Not for one-shot LLM calls or for configuring a coding assistant.
---

# Agent runtime

Build agents so that **a new agent is a definition** (prompt, response schema, tools, guards, budgets), not new plumbing.

## Principles

- Keep the loop in your code. Do not adopt an agent framework or managed agent service unless the user decides to.
- Keep the model provider behind a port. Provider SDKs are imported in one adapter directory, enforced by a test or lint rule.
- Enforce safety in code around the model, never only in the prompt.
- Compute what code can compute before the model runs, and validate the model's version afterward.
- Treat tool results, uploads, fetched pages, summaries, and memory as untrusted data.
- Gate every prompt, tool-description, or model change with an eval that runs offline.
- Start with one loop per run. Add subagents only when an eval shows they beat it on cost and quality.

## Workflow

1. **Establish the context.** Decide whether this is a new repository or an existing codebase. Identify the principals, what data the agent may reach, the provider, and which actions change state.
2. **Load the references you need:**

   | Need | Reference |
   | --- | --- |
   | Type contracts and runtime rules | [contracts](references/contracts.md) |
   | Tools and prompts | [tool and prompt design](references/tool-and-prompt-design.md) |
   | Tests and evals | [evals](references/evals.md) |
   | New repository | [greenfield profile](references/greenfield-profile.md) |
   | Existing application | [existing codebase](references/existing-codebase.md) |
   | Reusable thin domain agent (e.g. Asterisk) | [domain agent integration](references/domain-agent-integration.md) |
   | Bedrock Converse | [Bedrock adapter](references/providers/bedrock-converse.md) |
   | OpenAI Responses | [OpenAI notes](references/providers/openai-responses.md) |
   | What has been proven | [maturity](references/maturity.md) |

3. **Write an agent-specific spec** before code: audience, jobs, tools, guards, budgets, storage, retention, and open decisions. Ask the user about product, data-access, and retention decisions instead of guessing.
4. **Verify provider behavior.** Provider details change and vary by model. Re-check them against current documentation and a live smoke test, and record the result in an ADR.
5. **Build in dependency order:** port and types; registry; guards; loop and runtime with a fake provider; sessions and context; evals; provider adapter; approvals; quotas and audit; memory; transport; first agent.
6. **Validate.** Tests and evals must pass without provider credentials. The live smoke test is opt-in. Report anything that was not run.

If the `software-delivery` skill is installed, use it to carry out each implementation step. Never push, merge, deploy, or enable a write tool without explicit approval.
