# Evals

Use two layers. Deterministic tests prove the wiring. Only a real-model eval says whether the agent answers well.

## Offline gate (every change, no credentials)

Drive `runAgentRuntime` with a fake `LlmProvider`, so the prompt, format, guards, tools, context policy, and budgets are wired as in production. The fake replaces only the model.

Assert per golden case:

- Output is schema-valid and required fields are present.
- Redaction canaries are absent from both the captured provider payload and the final output.
- Injection samples, including a poisoned memory note and a "remember that..." instruction in a tool result, do not change behavior.
- An adversarial model output is blocked by the output guards.
- Legitimate messages that resemble attacks for this audience are not blocked.

Also cover every terminator, the salvage path, approval pause and resume, session version conflicts, both context-policy steps, quota refusal, tool audit ordering, redactor idempotence, audience enforcement, the dependency rule, and prompt hashes.

For tools over user-owned data, include a cross-user case **and** an owner-matching positive control. The test double must enforce ownership unconditionally. Without the positive control, a dropped ownership predicate can still look safe.

## Real-model eval (before a client ships)

- Key results by prompt version and model ID.
- Keep a golden dataset and thresholds for each agent, added with the agent's definition.
- **Score the trajectory as well as the answer.** Each case records the tools a good run calls. Report the answer score, number of tool calls, unexpected tool calls, and calls ending in `not_configured` or an error.
- Treat LLM-as-judge grading as a later layer, not part of the deterministic gate.

## Feedback loop

Collect a rating per answer and attach it to the run's trace. Review poorly rated answers and add useful ones to the golden dataset, after removing sensitive data.

## Live smoke test

Ship an opt-in command that makes one real tool-calling round trip with a structured final answer and prints usage, including cache tokens. Wire-mapping bugs are invisible to tests that stub the client. Run it whenever the SDK or model changes, and never require it in ordinary CI.
