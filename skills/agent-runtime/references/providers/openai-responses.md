# OpenAI Responses adapter notes

**Status: starting notes, not a verified adapter specification.** Check every item against the current [OpenAI documentation](https://developers.openai.com/api/docs) for the configured model before relying on it, and record the result in an ADR.

Implement the LLM port in [contracts](../contracts.md). Points to verify:

- **Statelessness.** With `store: false`, the provider keeps no conversation state. Replay what the next request needs, including encrypted reasoning items, through `provider_state`.
- **Strict schemas.** Function tools in strict mode may require every property to be present. Model optional fields as nullable, and test that every registered tool survives conversion.
- **Structured output.** Use the provider's schema-constrained response format, and still validate with zod before returning.
- **Usage.** Normalize to the port's definition, where `inputTokens` is total input and cached tokens are a portion of it.
- **Caching.** Keep the prefix stable. Check how caching is keyed and reported for the configured model.
- **Failures.** Map provider errors to `SafeLlmFailure`, and never retry a rejected request.
- **Hosted MCP.** The provider can call MCP servers itself. This bypasses the tool registry, so follow the hosted MCP exception in the contracts.
- **Smoke test.** Make one real tool-calling round trip with a structured final answer and report usage.
