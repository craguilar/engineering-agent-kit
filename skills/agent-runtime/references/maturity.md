# Maturity

This specification was generalized from real agent work, but not every part has run. Use this page to decide where to add extra review and testing. Last reviewed 2026-11-21.

| Area | Status |
| --- | --- |
| Bounded loop, iteration and token budgets | Implemented in one application |
| Salvage path | Implemented in one application |
| Tool registry and validation | Implemented in one application |
| Approval pause and resume | Implemented in one application |
| Sessions | Implemented in a different shape from these contracts |
| Cross-session memory | Implemented in a different shape from these contracts |
| In-process and hosted MCP policy | Derived from one application's decisions |
| Wall-clock deadline and `salvageReserveMs` | Specified only |
| Context compaction | Specified only |
| Per-principal quotas | Specified only |
| `ToolAuditLog` port | Specified only |
| Exempt redaction fields | Specified only |
| Trajectory scoring and feedback loop | Specified only |
| OpenAI Responses adapter | Implemented in one application; the notes here are unverified |
| Bedrock Converse adapter | Specified from AWS documentation; **no implementation or live test yet** |

"Implemented" means matching code exists in that application. It does not mean the code conforms to every rule in these contracts. Update this table when an area is built or tested.
