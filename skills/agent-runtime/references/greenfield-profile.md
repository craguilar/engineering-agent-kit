# Greenfield profile

Use this when scaffolding a new, domain-agnostic agent template repository. In an existing application, use [existing codebase](existing-codebase.md) instead.

**Non-goals:** domain logic, UI, deployment infrastructure, managed agent services, and agent frameworks.

## Default stack

Node.js 22+, strict TypeScript, ES2022, NodeNext modules, npm, zod, Vitest, and Fastify for a thin HTTP adapter. The chosen provider SDK is the only model dependency. Ask before adding any other dependency.

## Layout

Dependency rule: `domain <- app <- (infra, web)`. `src/index.ts` is the composition root.

```text
src/
  domain/        pure, no I/O: guards/, redaction/, types/, utils/
  app/
    llm/         provider.ts (port), failures.ts, prompts/ (one versioned module per agent)
    agents/      loop.ts, runtime.ts, context.ts, observability.ts, definitions/
    tools/       registry.ts, one file per tool category
    approvals/   approval service
    ports/       SessionStore, ApprovalStore, MemoryStore, QuotaStore, ToolAuditLog, SecretsProvider
  infra/
    llm/         provider adapter, tracing adapter
    external/    http.ts + one client per third-party service
    storage/     in-memory and SQLite adapters (dev defaults)
  web/           thin routes, JSON + SSE
evals/           golden cases, run.ts, promptHashes.ts
test/            <module>.test.ts
docs/            architecture.md, decisions/
```

Enforce the rule with a test or lint rule that fails CI: `domain` imports nothing outside itself, and no file outside `src/infra/llm/` imports a model SDK. Keep the process stateless between requests so any hosting shape works.

`SecretsProvider` is the one port not defined in the contracts: `get(name: string): Promise<string | null>`. A missing secret makes the integration `not_configured`.

## Deliverables

1. The repository above, building and typechecking clean.
2. One trivial example agent with two tools, one read-only and one requiring approval, proving the loop, approval pause and resume, guards, and salvage end to end.
3. `AGENTS.md` with the dependency rule, SDK boundary, code-enforced guards, tool failures as results, prompt versioning, and tests shipping with code.
4. `docs/architecture.md` and ADRs for: own loop, MCP policy, and structured-output strategy.
5. The tests listed in [evals](evals.md), plus adapter mapping tests with a stubbed client (usage normalization, every stop reason), failure classification, and tool schema conversion.
6. Scripts: `lint`, `typecheck`, `test`, `evals`, `build`, and an opt-in provider smoke test.

## Acceptance criteria

- `npm run typecheck && npm test && npm run evals` pass with no provider credentials.
- The smoke test completes a real tool-calling round trip with structured final output and reports usage. Cache reads are non-zero on the second iteration when the prefix exceeds the model's minimum cacheable size.
- Adding a second agent requires only a prompt module, a definition, and golden cases.
- A second turn replays the first turn's stored items, and a session past `compactAtShare` compacts without changing the tools or system prefix.
- Swapping the provider requires only a new adapter and a composition-root change.
- No model SDK import exists outside the adapter directory, and `domain` imports nothing from `app`, `infra`, or `web`.
