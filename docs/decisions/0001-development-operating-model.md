# ADR 0001: Development operating model

- **Status:** Accepted
- **Date:** 2026-07-11

## Context

The proposed Reddit workflow recommends a large documentation pack, strict ticket-sized Codex runs, a ChatGPT-to-Codex relay, manual completion reports, and hand-maintained repository state. It correctly addresses scope drift and unverifiable agent output, but several mechanisms duplicate sources of truth or reflect tools that cannot inspect the same repository and runtime.

## Decision

Use one Codex task as the planning, implementation, explanation, and verification loop. Keep a concise root `AGENTS.md`, a product brief, an architecture document, a delivery document, and ADRs. Use GitHub issues and pull requests for planned work and follow-ups once a remote exists. Derive current state from git, source, dependency manifests, CI, and deployments.

Work in small coherent vertical slices, not an arbitrary one-ticket/one-run limit. Verification must include runtime or browser evidence when behavior is user-visible.

## Rationale

The Reddit workflow is directionally right about durable instructions, bounded changes, acceptance criteria, and verification. Its holes are:

1. Eleven overlapping documents create maintenance work before product learning and will contradict each other.
2. A mandatory ChatGPT/Codex relay loses evidence and is unnecessary when Codex can plan, inspect, edit, test, browse, and retain a durable goal in the same task.
3. A hand-maintained current-state document competes with authoritative machine-readable sources.
4. "Allowed files" can prevent necessary tests, migrations, or docs and encourages output-shaped rather than outcome-shaped tickets.
5. Manual checks alone do not scale; important behavior must graduate into automated regression, accessibility, integration, and browser tests.
6. It omits threat modeling, dependency/supply-chain controls, data classification, migrations/backups, observability, performance budgets, accessibility, preview environments, rollback, and architecture decision records.
7. "Build passed" and completion reports are evidence summaries, not proof. CI, tests, browser inspection, and production telemetry are proof sources.

## Consequences

- Less documentation exists, but each document has a distinct owner and purpose.
- Codex may complete more than one mechanical step in a run when needed for an end-to-end outcome.
- GitHub and CI become important sources of truth after repository creation.
- We must invest early in executable quality gates once code exists.
