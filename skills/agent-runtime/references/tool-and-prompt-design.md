# Tool and prompt design

A tool's name, description, and result are read by the model, so write them as prompts. Runtime enforcement is in [contracts](contracts.md).

## Tools

- **Shape tools around jobs, not endpoints.** A question the agent answers often should take one call to a tool that computes the summary in code. Keep granular `list_*` and `get_*` tools for drill-down.
- **Compute in tools.** Deltas, diffs, rates, and sums come from code, not from the model.
- **Label identifiers.** Return `"run 4, model A vs model B, 12 Nov"`, not a bare ID.
- **Control result size.** Read tools with large results take `detail: "concise" | "full"`, default `concise`. Return IDs of interesting items rather than every row.
- **Make errors actionable.** Say what to do next: `"no run with that ID; call list_runs"`.
- **Keep identity out of inputs.** No tool schema may contain a user ID, email, or principal. It comes from the authenticated context, and a test asserts this over every registered tool.
- **Return the minimum data.** Prefer aggregates to rows. Never return secrets or direct identifiers unless the agent's spec explicitly requires it.
- **Thin handlers.** Validate, then delegate to existing services.
- **Version descriptions.** A description changes behavior as much as the prompt does, so it is covered by the prompt-version hash.

## Prompts

Every agent prompt covers, in this order:

1. **Who and where:** who the agent serves and in which environment.
2. **How to work:** gather evidence with tools before answering, call independent read tools in parallel, and use a computing tool instead of doing arithmetic.
3. **How to answer:** back each claim with a reference, say "I could not determine X" instead of guessing, and ask a clarifying question when the request is ambiguous.
4. **When to stop.**

Keep volatile content out of the system prompt. The date, session summary, memory notes, and page context arrive in the user message, delimited as data.

## Response schema

Prefer structured fields the client can render and test: the answer, references, an optional clarifying question, and follow-ups. If the agent suggests an action, mark whether that suggestion was actually checked.
