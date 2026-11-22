# Agent runtime contracts

Provider-neutral contracts for a bounded tool-calling agent. TypeScript is the notation; port the
shapes to the host language if needed, and keep the behavior. See [maturity](maturity.md) for which
sections have run in production code.

## 1. LLM port

The port is the only thing the loop knows about a model. It is provider-neutral: nothing in it
names a vendor.

```ts
interface LlmUsage {
  inputTokens: number;        // total input sent, cached or not
  cachedInputTokens: number;  // portion of inputTokens read from the prompt cache
  cacheWriteTokens: number;   // portion of inputTokens written to the prompt cache
  outputTokens: number;
}

interface LlmToolDefinition { name: string; description: string; inputSchema: z.ZodTypeAny }
interface LlmToolCall { id: string; name: string; input: unknown }
interface LlmToolResult {
  toolCallId: string;
  output: string;
  isError: boolean;
  exemptFields?: string[];   // copied from the tool's metadata; see Exempt fields in section 4
}

/** Opaque state an adapter needs to continue a stateless tool-calling turn. */
interface LlmProviderState { provider: string; value: unknown }

type ConversationItem =
  | { kind: "user_message"; content: string }
  | { kind: "assistant_message"; content: string }
  | { kind: "tool_call"; call: LlmToolCall }
  | { kind: "tool_result"; result: LlmToolResult }
  | { kind: "provider_state"; state: LlmProviderState };

interface GenerateStructuredOptions<T> {
  systemPrompt: string;
  promptVersion: string;
  input: string;
  schema: z.ZodType<T>;
  formatName?: string;
  signal?: AbortSignal;
}
interface StructuredGeneration<T> { output: T; model: string; usage: LlmUsage }

interface GenerateTurnOptions<T> {
  systemPrompt: string;
  promptVersion: string;
  conversation: ConversationItem[];
  tools: LlmToolDefinition[];
  finalSchema: z.ZodType<T>;   // the adapter validates the final answer before returning
  finalFormatName?: string;
  reasoning?: boolean;         // extended thinking, when the model and the output path allow it
  signal?: AbortSignal;
}

/** One iteration: the model either calls tools or produces the final output. */
type LlmTurn<T> =
  | { kind: "tool_calls"; calls: LlmToolCall[]; continuation?: LlmProviderState; model: string; usage: LlmUsage }
  | { kind: "final"; output: T; model: string; usage: LlmUsage };

interface LlmProvider {
  readonly name: string;
  readonly model: string;
  generateStructured<T>(options: GenerateStructuredOptions<T>): Promise<StructuredGeneration<T>>;
  generateTurn<T>(options: GenerateTurnOptions<T>): Promise<LlmTurn<T>>;
}
```

Rules:

- Both calls are single-turn. The loop never lives in the adapter.
- `inputTokens` is the **total** input sent. Every adapter normalizes to that definition, because some
  providers report only non-cached input and a budget built on that figure silently undercounts.
  Export `emptyUsage()` and `addUsage(a, b)` beside the type.
- `provider_state` is opaque to the loop: it is stored and replayed in order, never read or edited.
- The provider never executes tools and never pauses for approval. Tool execution and approval
  belong to the registry and the loop (sections 3 and 5), which is why `LlmTurn` has only two kinds.

Failures cross the port as one safe shape:

```ts
type LlmFailureCode =
  | "not_configured" | "request_rejected" | "authentication_failed" | "model_access_denied"
  | "rate_limited" | "timeout" | "service_unavailable" | "provider_error";

interface SafeLlmFailure { code: LlmFailureCode; message: string; retryable: boolean }

function classifyLlmFailure(error: unknown): SafeLlmFailure;

class LlmFailureError extends Error { readonly failure: SafeLlmFailure }
```

An adapter throws an `LlmFailureError` carrying a `SafeLlmFailure` once its retries are spent. The
loop catches it only inside the salvage path (section 2).

## 2. Agent loop and runtime

`runAgentLoop` drives one run: it calls `generateTurn`, executes the
tool calls through the registry, appends the results and repeats until a terminator fires.

```ts
interface AgentLoopConfig {
  maxIterations: number;          // default 8
  maxTotalTokens: number | null;  // input + output across all iterations; null = uncapped
  maxToolResultChars: number;     // default 24_000
  deadlineMs: number;             // wall clock for the whole run
  salvageReserveMs: number;       // part of deadlineMs kept for salvage; default 10_000
  readOnlyConcurrency: number;    // default 3
}

interface AgentRunStats {
  iterations: number;
  usage: LlmUsage;
  model: string | null;
  partial?: boolean;       // the answer came from the salvage path
  salvageError?: string;   // diagnostic only, never shown to a user
}

type AbortReason =
  | "max_iterations" | "token_budget" | "deadline" | "cancelled" | "quota_exceeded"
  | "input_guard_blocked" | "output_guard_blocked" | "unsafe_tool_payload";

type AgentLoopOutcome<T> =
  | { status: "completed"; output: T; violations: GuardViolation[]; stats: AgentRunStats }
  | { status: "approval_required"; approvals: ToolApproval[]; continuation: ConversationItem[];
      violations: GuardViolation[]; stats: AgentRunStats }
  | { status: "aborted"; reason: AbortReason; violations: GuardViolation[]; stats: AgentRunStats };
```

The loop follows these rules:

1. **Deterministic pre-pass stays outside the loop.** Whatever code can compute is computed before
   the first model call and passed in as context. The runtime definition has an optional
   `prepare(message, ctx)` hook for this.
2. **Tool failures are results, not exceptions.** Unknown tool, invalid input and handler errors
   are appended as error results so the model can adapt.
3. **Central tool-result cap** (`maxToolResultChars`, default 24,000), with truncation announced
   to the model in the result text.
4. **Terminators:** final output, approval required, `maxIterations` (default 8, per agent), token
   budget, a wall-clock deadline, and caller cancellation via `AbortSignal`.
5. **Salvage before abort.** On budget, iteration, deadline or context-window exhaustion, make one
   tool-less call forcing an answer from what was gathered, mark `stats.partial`, and abort only if
   that fails. The loop stops starting work at `deadlineMs - salvageReserveMs`, so the salvage call
   has time to run. On context-window exhaustion, apply the context policy (section 6) first, then
   make that call. Caller cancellation never salvages.
6. **One finalize path.** Normal and salvage finals go through a single function: inspect, block
   or sanitize, return. A salvage path that runs the output guards but skips `sanitize` is a bug.
7. **Budgets scale with the tool surface.** Tool definitions are resent every turn. Add a test that
   fails when the serialized tool definitions exceed a configured share of the token budget.
8. **Cache-friendly prefix.** Nothing volatile (timestamps, IDs, session data) in the tools or
   system prompt. Record cached tokens per run. Zero cached tokens on iteration 2+ is a bug only
   when the prefix exceeds the model's minimum cacheable size.
9. **Parallel tool calls.** A model may return several tool calls in one turn. Execute `readOnly`
   tools concurrently with a small limit; execute everything else sequentially in order. If any
   call requires approval, first run and record every call that does not, then pause once with
   **all** approval-required calls pending. Resolve every pending call before the next model turn,
   and return the turn's results in the order the model made the calls.
10. **Malformed tool calls.** When the provider reports a malformed call with a usable call ID,
    return an error result. Without one, retry once as a fresh turn. Never invent a result for a
    call that has no valid ID.
11. **Current date.** The runtime adds it to each turn's user message, delimited as data. It never
    goes in the system prompt, which must stay cacheable.
12. **One loop per run.** Add a planner, critic or delegate agent only when a golden-case eval shows
    it beats the single loop on cost and quality.

`runAgentRuntime` is the single entry point for HTTP routes and
evals. It takes a definition, calls `prepare`, runs the loop and reports to the observer
(section 10). Routes never assemble provider requests.

A run is one turn of a session (section 6). In order, the runtime checks the quota (section 8),
loads or creates the session, recalls memory when the agent uses it (section 7), calls `prepare`,
runs the loop, persists the turn and charges the quota.

```ts
interface AgentRuntimeDefinition<T> {
  name: string;
  audience: string;                            // the principal kind this agent serves (section 3)
  prompt: { text: string; version: string };
  format: { name: string; schema: z.ZodType<T> };
  tools: ToolRegistry;
  inputGuards?: InputGuard[];
  outputGuards?: OutputGuard[];
  loop?: Partial<AgentLoopConfig>;
  context?: Partial<ContextPolicy>;            // section 6
  memory?: { maxNotes: number; maxNoteChars: number };   // absent = the agent has no memory
  reasoning?: boolean;                         // default false
  prepare?(message: string, ctx: ToolContext): Promise<string>;   // deterministic pre-pass
}

interface AgentRuntimeStores {
  sessions: SessionStore;
  approvals: ApprovalStore;
  toolAudit: ToolAuditLog;
  memory?: MemoryStore;
  quotas?: QuotaStore;
}

interface RunAgentRuntimeOptions<T> {
  llm: LlmProvider;
  definition: AgentRuntimeDefinition<T>;
  stores: AgentRuntimeStores;
  principal: Principal;
  sessionId?: string;                          // absent = start a new session
  message: string;
  signal?: AbortSignal;
  observer?: AgentRunObserver;
  resume?: { gateId: string; decisions: ToolApprovalDecision[] };
}

function runAgentRuntime<T>(
  options: RunAgentRuntimeOptions<T>
): Promise<AgentLoopOutcome<T> & { sessionId: string; runId: string; gateId?: string }>;
```

`gateId` is present only when the status is `approval_required`. The runtime stores the loop's
continuation through the approval store (section 5) and returns the gate ID in its place; the
caller passes it back in `resume`.

The runtime rejects a principal whose `kind` differs from `definition.audience` before any other
step.

## 3. Tool surface

The registry is the only way a tool runs, and it is the allowlist:
a tool that is not registered cannot be invoked.

```ts
/** Who a run acts for. The model never supplies or sees it. */
interface Principal { kind: string; id: string }

interface ToolMetadata {
  group: string;
  audience: string;          // the principal kind allowed to use this tool
  readOnly: boolean;
  requiresApproval: boolean;
  approvalTarget?: string;   // human-readable destination shown to the approver
  configured?: boolean;      // false for an integration without credentials
  idempotent?: boolean;
  redactionExemptFields?: string[];   // result fields exempt from redaction (section 4)
}

interface ToolContext { principal: Principal; requestId: string; signal: AbortSignal }

interface ToolSpec<TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  metadata: ToolMetadata;
  handler: (input: TInput, ctx: ToolContext) => Promise<TOutput>;
}

/** Identity helper that pins TInput/TOutput inference at the definition site. */
function defineTool<TInput, TOutput>(spec: ToolSpec<TInput, TOutput>): ToolSpec<TInput, TOutput>;

type ToolInvocation =
  | { status: "ok"; output: unknown }
  | { status: "error"; message: string }
  | { status: "approval_required"; message: string };

class ToolRegistry {
  register<TInput, TOutput>(spec: ToolSpec<TInput, TOutput>): void;   // throws on a duplicate name
  get(name: string): ToolSpec<any, unknown> | undefined;
  list(): ToolSpec<any, unknown>[];                                   // registration order, stable
  invoke(name: string, rawInput: unknown, ctx: ToolContext,
         options?: { approvalGranted?: boolean }): Promise<ToolInvocation>;
}
```

`invoke` runs four steps in order: allowlist check, zod validation, approval gate, execute. It
never throws: an unknown tool, invalid input and a handler exception each return `status: "error"`.

Audience is enforced twice. A registry is built for one audience and `register` throws on a tool
of another. `invoke` returns `status: "error"` when `ctx.principal.kind` differs from the tool's
audience. `ToolContext` is built by the entry point from the authenticated caller. No tool input
schema may contain a principal or user identifier; a test asserts this over every registered tool.

- Handlers are thin: validate, delegate to domain or infra. No network calls from a handler; go
  through an infrastructure client built on the shared HTTP wrapper (timeouts, retries,
  rate limits, auth injection, egress allowlist, SSRF guard against private address ranges).
- An integration without credentials returns a `not_configured` result. It never fakes data and
  never fails the run.
- Write tools require approval by default and take an idempotency key. The one standing exception
  is `remember` and `forget` (section 7), which write only the caller's own notes.
- **Register only what works.** Build each registry per environment with the tools configured
  there. A tool the model can see but cannot use costs an iteration to discover. Keep the list
  fixed per deployment so the cached prefix is stable. `not_configured` remains the answer for an
  integration that fails at run time.
- **MCP:** in-process client only. Each remote tool is wrapped as a reviewed registry entry so it
  passes the same allowlist, validation, approval and result guards as a local tool. Never trust
  server-advertised annotations; servers and their exposed tools are operator-declared. No stdio
  servers. Record this in an ADR.
- **Hosted MCP is an exception, not a default.** When the provider calls the server, arguments skip
  the registry and results reach the model before guards can see them, so a guard can only detect
  a problem after the fact. Allow it only through an ADR, for an operator-reviewed catalog whose
  results are public, with an explicit tool allowlist and approval required by default. Anything
  that can return tenant or customer data uses the in-process client.

## 4. Guards

Guards are pure. They run in code around the model, so a rule
holds even when the prompt is ignored.

```ts
interface GuardViolation {
  guard: string;              // name of the guard that raised it
  message: string;
  action: "block" | "flag";   // block stops the operation; flag annotates the result
}

/** Inspects text on its way to the model: the initial input and every tool result. */
interface InputGuard {
  readonly name: string;
  inspect(payload: string): GuardViolation[];
}

/** Inspects the final structured output before it is returned. */
interface OutputGuard {
  readonly name: string;
  inspect(output: unknown): GuardViolation[];
  /** Optional repair, applied only when this guard flagged. A block is never sanitized. */
  sanitize?(output: unknown): unknown;
}

function hasBlocking(violations: GuardViolation[]): boolean;
```

The agent definition may lower a guard's action from `block` to `flag` for its audience. A
pattern tuned for anonymous end users misfires on an authenticated operator whose job involves
the same words, such as an operator debugging prompts. The action is never raised or lowered by
the model.

The sensitive-data gate has two supported policies, chosen per agent: **block** (input must already
be redacted, and a match stops it) or **redact and continue** (redact, record which patterns fired,
proceed). Use redact-and-continue when ordinary input is expected to contain sensitive values.

A blocking input violation on the initial input aborts the run (`input_guard_blocked`). A blocking
output violation aborts it (`output_guard_blocked`). Flags are returned in `violations` with the
answer.

Ship these generic guards:

- **Sensitive-data gate (input).** Scans the initial payload and every tool result re-entering the
  conversation. It asserts the redactor as a fixed point, so `redact` must be idempotent; add a
  property test for that. Patterns are configurable, with a default set for secrets, tokens, keys,
  connection strings and emails. A blocked tool result is withheld and replaced with a notice; the
  loop continues.
- **Untrusted-content handling (input).** All external content (user uploads, tool results, fetched
  pages) is structurally delimited as data in the prompt. Instruction-like content is flagged.
- **Output redaction (output).** Flags and sanitizes sensitive data in the final answer.
- **Replay inspection.** Continuation state persisted for approvals is scanned before storage.
  Sensitive data found there aborts the run (`unsafe_tool_payload`).

**Exempt fields.** Broad redaction patterns can corrupt legitimate text. A tool may declare a result
field exempt only when its content is committed to the repository and holds no end-user data, such
as a prompt template. Content written at run time is never exempt. The exemption is declared in the
tool's metadata, recorded on the stored result so replay inspection skips exactly that field, and
covered by that tool's test.

Leave domain output guards as an extension point and document this pattern: when a
fact can be computed or looked up deterministically, compute it before the model and validate the
model's version after. A divergence in the unsafe direction blocks; in the safe direction it flags.

## 5. Human approval

```ts
interface ToolApproval { requestId: string; name: string; target?: string; arguments: string }
interface ToolApprovalDecision { requestId: string; approve: boolean; reason?: string }

/** What a paused run needs to continue. Stored redacted. */
interface PendingApproval {
  gateId: string;                    // opaque, expiring, single-use
  agent: string;
  principal: Principal;
  sessionId: string;
  approvals: ToolApproval[];
  continuation: ConversationItem[];
  stats: AgentRunStats;
  expiresAt: Date;
}

interface ApprovalStore {
  put(pending: Omit<PendingApproval, "gateId">): Promise<string>;   // returns the gate ID
  /** Returns the pending run and deletes it in one step. Null when absent, expired, used, or not theirs. */
  consume(gateId: string, principal: Principal): Promise<PendingApproval | null>;
}
```

- A `requiresApproval` tool call pauses the run and returns `approval_required` with a pending call.
- The approval service persists the continuation behind an opaque, expiring, single-use gate ID
  through the `ApprovalStore` port. Arguments shown to the approver are the exact ones executed.
- Resume happens exactly once; a rejection becomes an ordinary tool result so the model can answer
  without the tool. Budgets carry across the pause: the
  resumed run starts from the stored `stats`.
- Non-interactive entry points receive only tools that need no approval.

## 6. Sessions and context

A conversation is a session. Each call to `runAgentRuntime` adds one turn to it.

```ts
interface AgentSession {
  id: string;
  agent: string;
  principal: Principal;
  items: ConversationItem[];   // redacted; exactly what the next turn replays
  summary: string | null;      // written by compaction
  lastInputTokens: number;     // reported by the most recent model call
  version: number;             // incremented on every write
  expiresAt: Date;
}

interface SessionStore {
  create(agent: string, principal: Principal): Promise<AgentSession>;
  /** Returns null when the session is absent, expired, or belongs to another principal or agent. */
  load(id: string, agent: string, principal: Principal): Promise<AgentSession | null>;
  /** Fails with a conflict when `expectedVersion` is stale. */
  save(session: AgentSession, expectedVersion: number): Promise<void>;
  delete(id: string, principal: Principal): Promise<void>;
}

interface ContextPolicy {
  maxContextTokens: number;             // the model's window minus the output allowance
  clearToolResultsAfterTurns: number;   // default 3
  keepRecentTurns: number;              // default 6
  compactAtShare: number;               // default 0.6
}
```

**History**

- The runtime loads the session, appends the new `user_message` and hands the items to the loop.
- It saves the session only when the run ends `completed`. It stores the user message, the tool
  calls and results of the turn, and the final answer as an `assistant_message`. Everything stored
  has passed the guards. An `aborted` run stores nothing. An `approval_required` run stores its
  continuation through the approval store (section 5), not in the session.
- Stored items must be a fixed point of the redactor. A session never holds raw sensitive data.
- `provider_state` items are needed only while a turn is in flight. They are dropped when the turn
  completes. Re-check this for the configured model before relying on it.
- Two turns on one session at the same time are a conflict. The second `save` fails on the stale
  version and the caller gets a typed error. Nothing is merged.
- Sessions expire. Expired sessions are deleted, not hidden.

**Context policy**

Applied before every model call. Context size is the `inputTokens` the previous call reported, so
no tokenizer is needed. The first call of a resumed session uses the stored `lastInputTokens`.

1. **Clear old tool results.** A tool result older than `clearToolResultsAfterTurns` turns is
   replaced by a one-line notice naming the tool. The model can call the tool again. This step
   costs no model call and always runs first.
2. **Compact.** When the context still exceeds `compactAtShare × maxContextTokens`, everything
   older than the last `keepRecentTurns` turns is summarised by one `generateStructured` call with
   its own versioned prompt. The summary replaces those items in the session. It passes the
   sensitive-data gate like any other model output.

Rules:

- The summary lives in the first user message, delimited as data. It never enters the system
  prompt or the tool list, so the cached prefix survives compaction.
- Compaction is lossy by design. The full record of a run is the trace, not the session.
- If the compaction call fails, the run continues on step 1 alone. If the window is then exceeded,
  the run ends through the salvage path (section 2).
- The salvage path's context-window branch calls this same function. There is one trimming
  mechanism in the codebase.
- Compaction usage counts toward the run's token budget and quota, and emits a `compacted` event.

## 7. Memory

Memory is what an agent carries from one session to the next. It is optional per agent and off
unless the definition sets `memory`.

```ts
interface MemoryNote {
  id: string;
  agent: string;
  principal: Principal;
  text: string;
  createdAt: Date;
  expiresAt: Date;
}

interface MemoryStore {
  recall(agent: string, principal: Principal, limit: number): Promise<MemoryNote[]>;   // newest first
  save(agent: string, principal: Principal, text: string): Promise<MemoryNote>;
  forget(agent: string, principal: Principal, id: string): Promise<void>;
}
```

- **Scope.** A note belongs to one principal and one agent. Nothing is shared across principals.
- **Recall.** At the start of a session the runtime loads the newest `maxNotes` notes and places
  them in the first user message, delimited as untrusted data. A note is never an instruction: a
  poisoned note must not be able to change the agent's behaviour, and the injection eval cases
  cover it.
- **Writing.** The model writes memory only through two registry tools, `remember` and `forget`.
  They pass the same allowlist, validation, redaction and audit as any tool, and need no approval
  because they write only the caller's own notes. `remember` rejects text over `maxNoteChars` and
  text the redactor changes, so the model must restate a note without the sensitive value.
- **Content.** Notes hold preferences and stable facts about how the principal works. They never
  hold identifiers or secrets.
- **Lifetime.** Notes expire and are deleted with the principal.
- **v1 recall is by recency.** The port is the seam for semantic recall or a managed memory
  service later; neither is built now.

## 8. Quotas and tool audit

**Quotas** bound what one principal can spend. The per-run budgets in section 2 do not.

```ts
interface QuotaStore {
  check(agent: string, principal: Principal): Promise<{ allowed: boolean; resetsAt: Date }>;
  charge(agent: string, principal: Principal, usage: LlmUsage): Promise<void>;
}
```

- The runtime calls `check` before anything else. When it is not allowed, the run ends `aborted`
  with `quota_exceeded` and no model call is made.
- `charge` runs after every run, whatever its outcome, with the run's total usage.
- Limits are runs per day and tokens per day, per agent, from config. A run already in flight is
  not cut short by the quota; the loop's own budget does that.

**Tool audit** records that a tool ran, for whom, and how it ended.

```ts
interface ToolAuditEntry {
  runId: string;
  sessionId: string;
  agent: string;
  principal: Principal;
  tool: string;
  status: "ok" | "error" | "blocked" | "approval_required" | "rejected";
  inputHash: string;      // hash of the canonical JSON input
  durationMs: number;
  approvalId?: string;
  at: Date;
}

interface ToolAuditLog { record(entry: ToolAuditEntry): Promise<void> }
```

- The loop writes one entry per tool invocation. Entries hold no input and no output.
- The log is append-only.
- For a tool that is not `readOnly`, the entry is written before the handler runs, and a failed
  write prevents the call. For a `readOnly` tool the write is best effort.

## 9. Prompts

One module per agent exporting `{ text, version }`. A test hashes each prompt together with the
agent's serialized tool definitions against a recorded hash per version, so a text or
tool-description change without a version bump fails CI.
`promptVersion` and model ID are recorded on every run.

## 10. Observability and events

```ts
type AgentEvent =
  | { type: "run_started"; runId: string; sessionId: string; agent: string; promptVersion: string }
  | { type: "turn_started"; iteration: number }
  | { type: "tool_started"; iteration: number; toolName: string; toolCallId: string; input?: unknown }
  | { type: "tool_finished"; iteration: number; toolName: string; toolCallId: string;
      status: ToolAuditEntry["status"]; durationMs: number; output?: string }
  | { type: "compacted"; removedItems: number }
  | { type: "approval_required"; approvals: ToolApproval[] }
  | { type: "final"; output: unknown; partial: boolean; violations: GuardViolation[] }
  | { type: "run_finished"; status: string; reason: AbortReason | null; usage: LlmUsage };

interface AgentRunObserver {
  onEvent(event: AgentEvent): void | Promise<void>;
}
```

- **Two consumers, two rules.** The client stream receives every event. Tracing and logs receive
  every event except the payload fields: `approvals`, `input` and `output` never leave for a
  telemetry backend through this path.
- **Tool payloads are opt-in.** `input` and `output` on the tool events are set only when the agent
  definition asks for them, so a client can show what a step did. `output` is the text the model
  received: redacted and capped.
- **Client stream.** The HTTP route answers as server-sent events, one per `AgentEvent`, with a
  comment line as heartbeat every 15 seconds so idle proxies keep the connection. A client
  disconnect aborts the run through its `AbortSignal`.
- **No token streaming.** `final` is sent once, after schema validation and the output guards. The
  user watches progress through the tool events, not through partial text.
- **Tracing.** One infra adapter emits OpenTelemetry spans named by the GenAI semantic conventions:
  `invoke_agent` for the run, `chat` for each model call, `execute_tool` for each tool call with
  `gen_ai.tool.name` and `gen_ai.tool.call.id`. Those conventions are still marked as in
  development, so pin the version you implement and record it in the ADR. The default is a no-op.
