# Bedrock Converse adapter

Implements the LLM port in [contracts](../contracts.md). Checked against the AWS documentation on
2026-11-21. The tool-use guide could not be read on that date, and limits vary by model. **Re-check
this page for the configured model before writing the adapter**, and record differences in an ADR.

**Auth and model selection**

- Use the AWS default credential provider chain only. No access keys in config or code.
- Converse requires the `bedrock:InvokeModel` IAM action. Document a minimum policy scoped to the
  specific foundation-model and inference-profile ARNs.
- `BEDROCK_MODEL_ID` and `AWS_REGION` come from config. Accept a model ID, an inference profile ID
  or an ARN, so cross-region routing is a config change. No model IDs in code.

**Conversation mapping**

- System prompt goes to `system`; `tool_call` becomes an assistant `toolUse` block; `tool_result`
  becomes a user `toolResult` block with `status: "error"` when `isError`.
- All results for one assistant turn go in a single user message, in call order.
- Converse returns tool input already parsed. Validate it with zod in the registry as usual.

**Tools**

- Convert each zod schema to JSON Schema for `toolConfig.tools[].toolSpec.inputSchema.json`,
  serialized in a fixed order. Set `strict: true` on each `toolSpec` when the model supports it.
- Strict schemas require `additionalProperties: false` on every object. Anything else returns a 400
  `ValidationException`.
- Not supported: recursive schemas, external `$ref`, numeric constraints (`minimum`, `maximum`,
  `multipleOf`), string constraints (`minLength`, `maxLength`), and `minItems` above 1.
- A schema may have at most 12 optional properties and 16 union-typed properties. Prefer listing
  fields in `required` and making them nullable.
- Add a test asserting every registered tool survives conversion under these rules.

**Structured final output**

- Use native structured output: `outputConfig.textFormat` with `type: "json_schema"` and the schema
  under `structure.jsonSchema` (`name`, optional `description`, and `schema`). In Converse the
  schema is passed as a JSON **string**, not an object.
- The same strict-schema rules apply as for tools.
- Some non-Anthropic model cards require an extra strict flag in `additionalModelRequestFields`.
  Check the model card for the configured model.
- Fallback for models without native support, or where `outputConfig` and `toolConfig` do not work
  together: a synthetic `final_answer` tool, appended last, whose input schema is the response
  schema, with tool choice `any`. A `final_answer` that arrives with other tool calls gets an error
  result telling the model to call it alone. Extended thinking allows only tool choice `auto` or
  `none`, so agents with thinking on must use the native path.
- Either way the adapter validates with zod before returning, and the choice is invisible to the loop.
- The AWS docs do not state that `outputConfig` and `toolConfig` work together in one request.
  Confirm it in the smoke test for the configured model, and set a per-model capability flag.

**Stop reasons**

The full list is `end_turn`, `tool_use`, `max_tokens`, `stop_sequence`, `guardrail_intervened`,
`content_filtered`, `malformed_model_output`, `malformed_tool_use`, `model_context_window_exceeded`.

- `tool_use` maps to `tool_calls`; `end_turn` maps to `final`.
- `malformed_tool_use`: the docs do not say what `content` holds. Follow the loop's malformed-call
  rule, and capture a real response before relying on a call ID.
- `model_context_window_exceeded` triggers the salvage path, not a retry.
- Everything else is a typed failure. Never return a `max_tokens` response as a final answer.

**Reasoning continuity**

- Extended thinking for Claude is enabled through `additionalModelRequestFields`.
- A tool-use turn returns `reasoningContent` blocks carrying text and a signature (or redacted
  content). They must be sent back complete and unmodified in the next request, or the request
  fails. Carry them in `provider_state`. The AWS page documents this for the Anthropic Messages
  format, so confirm the same behavior on Converse in the smoke test.
- The replay inspection guard must not rewrite these blocks. If it finds sensitive data
  in them it aborts the run; it never edits them.

**Prompt caching**

- Checkpoints are `{ "cachePoint": { "type": "default" } }` blocks, valid in `tools`, `system` and
  `messages` for Claude models. Maximum four per request.
- Bedrock processes the prefix in the order `tools`, then `system`, then `messages`. A change to
  the tool list invalidates the system and message caches. Keep tool order fixed.
- Place one checkpoint after the tool list, one after the system prompt, and one moving checkpoint
  at the end of the latest message so each loop iteration reads the previous iteration's prefix.
- The minimum cacheable prefix is per model (512 to 4,096 tokens) and cumulative. Below it the
  request succeeds but nothing is cached.
- Default TTL is 5 minutes, refreshed on each hit. `"ttl": "1h"` is available on some models and
  causes a `ValidationException` on models that do not support it; make it config-driven.
- Cross-region inference profiles can raise cache writes, because an entry is only readable where
  it was written.
- Usage reports `cacheReadInputTokens` and `cacheWriteInputTokens`. With caching on, Bedrock's
  `inputTokens` counts **only non-cached tokens**. Normalize in the adapter:
  `inputTokens = inputTokens + cacheReadInputTokens + cacheWriteInputTokens`. Without this the
  loop's token budget silently ignores most of each request.

**Resilience and failures**

- Set an explicit request timeout and a bounded SDK retry count. Retry throttling and 5xx with
  jittered backoff. Never retry a `ValidationException`.
- `classifyLlmFailure` maps these exceptions to the codes in the LLM port: `AccessDeniedException` (403),
  `ValidationException` (400), `ResourceNotFoundException` (404), `ThrottlingException` (429),
  `ModelNotReadyException` (429, the SDK already retries it), `ModelTimeoutException` (408),
  `ModelErrorException` (424), `InternalServerException` (500), `ServiceUnavailableException` (503).
- Returned messages are safe for end users, carry no provider detail, and come from a locale table
  rather than hardcoded strings.

**Other request fields**

- `guardrailConfig` is optional, from config, as defense in depth. It does not replace the code
  guards.
- Put agent name and prompt version in `requestMetadata` so invocation logs can be filtered. Never
  put user data there.
- Model invocation logging is an account-level setting that captures full prompts and responses.
  Treat enabling it as a data-retention decision.

A wire-mapping bug, such as reading tool arguments from the wrong SDK field, is invisible to unit
tests that stub the client. Ship an opt-in live smoke test (`npm run smoke:bedrock`) that makes one
real tool-calling round trip, and run it whenever the SDK or model changes.

## Must be confirmed by a live call

- `outputConfig` and `toolConfig` in one request.
- Extended thinking together with `outputConfig`, and reasoning-block replay on Converse.
- Strict tool schemas on the configured model.
- The `content` returned with `malformed_tool_use`.
- The minimum cacheable prefix for the configured model.

## References

- [Converse API reference](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html)
- [Prompt caching](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html)
- [Structured output](https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html)
- [Extended thinking](https://docs.aws.amazon.com/bedrock/latest/userguide/claude-messages-extended-thinking.html)
- [Tool use with Converse](https://docs.aws.amazon.com/bedrock/latest/userguide/tool-use-inference-call.html)
