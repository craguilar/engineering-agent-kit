# Phase handoff contracts

## Planner

Return: `summary`, `assumptions[]`, `acceptance_criteria[]`, `affected_paths[]`, `implementation_steps[]`, `test_cases[]`, `risks[]`, `requires_human_decision`.

## Tech lead

Return: `verdict` (`approved` / `revise` / `needs-human-decision`), `questions[]`, `required_changes[]`, `tradeoffs[]`, `testing_expectations[]`, `security_and_isolation_notes[]`.

## Tester

Return: `changed_test_files[]`, `test_cases[]`, `red_commands[]` with exit codes, `expected_failure_evidence`, `screenshots[]` (only real paths/links), `constraints[]`.

## Implementer

Return: `files_changed[]`, `implementation_summary`, `commands_run[]` with exit codes, `known_limitations[]`, `assumptions[]`.

## Reviewer

Return: `verdict`, `findings[]` (each has `severity`, `blocking`, `path`, `line_or_symbol`, `evidence`, `impact`, `recommended_fix`), `coverage_gaps[]`, `limitations[]`.

## Final report

Provide original request, acceptance-criteria statuses and evidence, plan decisions, files changed, tests added, validation commands and actual exit codes, review findings and fixes, visual artifacts when relevant, audit summary (agents/tools/files/approvals), unresolved risks, Git status, and readiness label. No false claims about tests, screenshot evidence, or independent review.
