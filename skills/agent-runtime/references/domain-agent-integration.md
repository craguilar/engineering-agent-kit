# Thin domain-agent integration profile

The engineering-agent-kit owns reusable **agent plumbing**. Domain repositories own their business logic, data pipelines, deterministic calculations, and domain-specific tools. Do not copy the runtime into each domain repository.

## Architecture

```text
User / CLI / API / scheduled caller
             |
       Agent transport
             |
 Shared agent runtime (session, model port, loop, guards, approvals, audit)
             |
     Domain agent definition (prompt, schema, budgets, registry)
             |
 Thin domain tool adapters -> domain service APIs / CLI / read models
             |
     Domain engine and persistent domain data
```

The domain engine must run without an LLM. The agent is an optional interface to the engine, not the engine itself. An agent definition can be installed and consulted independently of the development assistant that created it.

## Integration contract

For each domain agent, define:
- Stable agent ID and version, principal audience, prompt version and structured response schema.
- Named tools with input/output schemas, read-only/write classification, authentication scope, approval policy, timeouts, and error shapes.
- Domain service interface and deployment location; no direct database access from model-generated arguments.
- Session and memory scope, retention policy, audit events, quotas and per-run cost limits.
- Deterministic pre-pass for calculations, and output validation against the domain engine.
- Transport for on-demand invocation (CLI or API) and optional scheduled execution; neither transport owns the model loop.
- Offline fixtures and evaluation cases including stale data, unavailable tools, cross-user access, approval denial, and prompt injection.
- Clear ownership: runtime changes in engineering-agent-kit; domain implementation and domain-specific agent definition in the domain repo. Version the shared runtime dependency and test compatibility.

A tool adapter should delegate to an existing domain service. It must not reimplement prediction, financial sizing, settlement, or other domain rules in prompts or model-generated code.

## Example: Asterisk / Kalshi analyst

Asterisk owns market ingestion, match data, probabilistic models, rule evaluation, fees, risk sizing, ledger, and pick cards. The shared runtime supplies the conversational loop, tool registry, sessions, memory, guards, approvals, audit and model adapters.

Suggested initial **read-only** tool surface:
- `list_markets(filters)`: current available markets with timestamps and liquidity metadata.
- `get_pick_card(match_id)`: deterministic prediction and explanation with model/rule versions.
- `explain_prediction(prediction_id)`: market prior, model estimate, adjustments and missing inputs.
- `get_performance(period)`: ledger-backed Brier, log loss, calibration and closing-line value.
- `get_run_status()`: last pipeline completion, freshness and missing providers.

These are proposed interfaces, not claims of implemented Asterisk endpoints. Each response must identify data freshness, source, and whether it is simulated or real. The agent may summarize or explain but must not generate probabilities, override risk caps, or treat a stale pick as live.

**Trading stays disabled.** No order-placement tool belongs in the initial registry. Any later trade tool requires a separate domain specification, explicit operator approval, idempotency, risk checks, and evidence from paper trading and evaluation.

## Acceptance criteria

1. The Asterisk pipeline and its tests run without the agent runtime or an LLM.
2. The same agent definition can be invoked on demand through a documented CLI or API using the shared runtime.
3. The runtime and Asterisk tests use recorded fixtures and fake model responses; no credentials required.
4. Predictions and sizing are calculated only by Asterisk, with provenance and freshness preserved through tools and answers.
5. The agent cannot place orders, read another principal's data, or bypass tool guards.
6. An unavailable data provider returns an explicit unavailable/stale result, not invented data.
7. Agent-specific tests cover prompt injection, approval boundaries, errors, stale markets, and no-bet outcomes.

## Implementation order

First build the domain pipeline and read-only service contracts; then instantiate the shared runtime with an Asterisk-specific agent definition and registry; then add an on-demand transport and offline evaluations. Add scheduling only after interactive invocation works. Keep all reusable runtime fixes upstream in engineering-agent-kit.
