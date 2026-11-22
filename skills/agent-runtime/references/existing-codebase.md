# Adding the runtime to an existing codebase

The [contracts](contracts.md) apply. The [greenfield profile](greenfield-profile.md) does not: keep the host's stack, layout, and test conventions.

## Order of authority

1. The repository's own instructions and security policies.
2. The agent-specific spec you write for this codebase.
3. These references, for anything the first two do not restate.

## Inventory first

Find what already exists and plug into it. Do not build a second version.

| Concern | Look for | Rule |
| --- | --- | --- |
| Model access | Gateway, SDK boundary, routing | Add a turn method there; no model IDs in agent code |
| Resilience | Retries, circuit breakers | Every model call goes through them |
| Data residency | Region or model restrictions | New agents route through the same checks |
| Tracing and audit | Telemetry, audit tables | Extend them; keep payload rules |
| Redaction | Existing PII or secret filters | One redactor, extended, never duplicated |
| Prompts | Registry, versioning | No second prompt mechanism |
| Evals | Existing harness and CI gates | Register agents as new cases or adapters |
| Identity | Auth middleware | Build the `Principal` only from the authenticated request |
| Data isolation | Tenant or user scoping | Tools use the same enforced path |

Leave existing LLM call paths alone unless migrating them is a separate, agreed change.

## Adaptation decisions to record

- The concrete `Principal` kinds. Keep them separate: one audience per agent, with a test that a tool of one audience cannot register on another.
- For each audience: routes, readable data, storage, approver, audit identity, and user-facing message language.
- Guard action per audience. Test real messages from that audience against existing patterns, because a filter tuned for anonymous users can block an operator's normal work.
- Redaction fixtures per tool. Broad patterns can blank legitimate figures.
- Store implementations, including retention and deletion coverage for user-owned sessions, approvals, and memory.
- Transport limits. Check load balancer and proxy idle timeouts against the run deadline and stream heartbeat.
- Which provider behaviors remain unverified.

## Delivery

Land the work as small, additive changes that nothing calls until the route is added:

1. Spec and ADR.
2. Provider turn and adapter, with stubbed-client tests and a smoke test.
3. Registry and guards.
4. Loop, runtime, and context policy with a fake provider and in-memory stores.
5. Persistent stores and migrations.
6. First agent, with golden cases.
7. Route and streaming.
8. Client.

Start with a low-risk, read-only agent for an internal audience. Ship it before an end-user agent, and treat any runtime change the second agent needs as a finding about the building blocks.
