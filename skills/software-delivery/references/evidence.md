# Testing and visual evidence

- Prefer behavior-oriented tests before implementation and verify an expected failure (red). For refactoring or docs-only work, state why red is inapplicable and verify existing baseline tests.
- Unit tests for isolated logic; integration tests for boundary behavior; E2E tests for high-risk user flows.
- For UI changes, capture before/after or post-change screenshots with an actual browser/testing tool, noting page, viewport, scenario and paths. A claim that screenshots were taken without artifacts is a failure.
- For failures, capture exact command, exit code and concise relevant output. Distinguish environment failures from code defects.
- Ensure reviewer has original requirements, diff, and evidence, and does not depend on implementer's interpretation.
- Always document skipped test layers and any lack of test tooling.
