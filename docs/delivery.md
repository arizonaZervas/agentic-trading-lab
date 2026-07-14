# Delivery workflow

## Operating model

The owner and Codex work in one evidence loop:

1. Clarify the user outcome, constraints, non-goals, and definition of done.
2. Inspect the relevant code, docs, git state, tests, and runtime behavior.
3. Make the smallest coherent change that produces the outcome.
4. Run automated checks and inspect user-visible behavior in a real browser.
5. Review the diff for unrelated changes, security issues, and documentation drift.
6. Explain the result, tradeoffs, evidence, and remaining risk.
7. Commit through a pull request after the repository is connected to GitHub. The empty-repository bootstrap is the one direct-to-`main` exception because no base commit exists yet.

This replaces the Reddit post's rigid "ChatGPT plans, Codex implements, paste the report back" relay. A relay can still be useful when collaborating with people in different tools, but inside this Codex task it duplicates context and invites stale summaries.

## Work item shape

Once GitHub exists, each issue should contain only what helps implementation and review:

- User or system outcome
- Context and constraints
- In scope / out of scope
- Acceptance criteria, including failure states
- Verification expectations
- Links to relevant ADRs or design material

"Allowed files" and "do not touch" are useful for genuinely sensitive boundaries, but should not be mandatory boilerplate. Outcome-based scope is safer than forbidding a necessary test or documentation update.

## Definition of done

A change is done when all applicable conditions are met:

- The acceptance criteria are satisfied, including loading/error/empty/denied states.
- Formatting, linting, type checking, unit/integration tests, and production build pass.
- User-visible changes are inspected in a browser at relevant viewport sizes.
- Critical flows have end-to-end tests; accessibility checks and keyboard inspection pass.
- Authorization and validation changes include negative tests.
- Schema changes are represented by migrations and tested against a fresh database.
- Logs and analytics omit secrets and sensitive personal/financial data.
- Relevant docs and ADRs are current.
- The final diff contains no unrelated or generated local artifacts.
- Remaining risks and manual checks are explicit.

Run `./scripts/check-foundation.sh` for repository and documentation hygiene. The `Checks` GitHub Actions workflow runs the same check on pull requests and pushes to `main`.

For the trading research prototype, the canonical commands are:

```bash
npm install
npm run typecheck
npm test
npm run check
npm run backtest -- --csv /absolute/path/to/prices.csv
npm run backtest:core-dip -- --csv /absolute/path/to/prices.csv
npm run report:core-dip -- --snapshot /absolute/path/to/spy-snapshot.json --experiment-start YYYY-MM-DD
npm run report:core-dip:morning -- --snapshot /absolute/path/to/spy-morning-snapshot.json --experiment-start YYYY-MM-DD
npm run signal -- --csv /absolute/path/to/prices.csv --confirmed-month-end YYYY-MM-DD
```

There is no formatter, linter, production build, migration, browser test, database, local service, in-repository scheduler, or live broker command yet. Do not invent substitutes; add and document each when the corresponding product surface exists. [ADR 0008](decisions/0008-local-shadow-report-automation.md), as partially superseded by [ADR 0009](decisions/0009-morning-core-plus-dip-candidate.md), selects a local Codex automation as an external, read-only scheduler for shadow reports only.

For the shadow workflow, verify the Tuesday/Friday 6:35 AM `America/Los_Angeles` cadence and inspect the combined Codex task result and any email report. The signal must use the immediately prior completed NYSE session's explicitly adjusted close; preserve the raw SIP-settled close as a separate provenance field and never compare or merge the two price units without the recorded adjustment source. The exact completed 6:30 regular-session one-minute bar is context only and cannot become a retroactive opening fill. A Monday/Wednesday/Thursday read-only reconciliation check sends email only for an outstanding or changed approved order. Published full-day market closures are skipped, not shifted; dates beyond the bounded 2026-2028 calendar fail closed. A stale, future-dated, unrecognized-source, interpolated, incomplete, late, ambiguous, halted, untradable, unit-mismatched, semantically invalid, or unavailable prior close, adjusted history, opening bar, account, or order state must produce a blocked evaluation and no proposal. Missing expected output is a failed operational check, not evidence that no action was needed. In a fresh project-scoped Codex process, enumerate the Robinhood surface and prove that only the seven allowlisted read tools exist and review/place/cancel are unavailable. No scheduled task may review, place, or cancel orders, and neither a report nor an email reply constitutes trade approval. A later live order requires a new current quote, broker review, and a fresh exact approval outside the project boundary until the authenticated adapter exists.

## Branching and release

- Keep `main` releasable and protect it after the initial bootstrap commit.
- Use short-lived `codex/<description>` branches by default.
- Require pull requests and CI checks; use preview deployments for UI and integration verification.
- Promote a tested artifact to production when the hosting platform supports it, then run smoke checks and inspect error logs.
- Prefer forward fixes for schema changes; destructive migrations require a tested recovery plan and backup confirmation.

## Phase gates

These gates prevent technology progress from being mistaken for product progress:

### Discovery -> scaffold

- A specific first user and painful job are documented.
- The smallest useful workflow and non-goals are explicit.
- Data sensitivity, advice/safety posture, learning priority, budget, and operating constraints are answered.
- ADR 0002 is accepted or superseded with evidence.

### Scaffold -> first vertical slice

- Canonical local commands are documented and run in CI.
- The application builds and opens in a real browser.
- Runtime validation, error handling, logging, test layers, and environment conventions exist.
- Preview deployment works without production data or secrets.

### First vertical slice -> private MVP

- At least one target user can complete the workflow without developer assistance.
- Domain rules, failure states, accessibility, and critical browser behavior are tested.
- Feedback and product signals are collected with a defined decision threshold.
- Backups, migrations, error monitoring, and a recovery path exist for durable data.

### Private MVP -> public release

- Threat model and privacy/data-retention decisions are reviewed.
- Authentication, authorization, abuse controls, rate limits, and negative tests match the exposure.
- Production operations, ownership, cost alerts, incident response, and rollback are documented and exercised.
- Legal or professional review is obtained when the product's claims or consequences warrant it.

## What we intentionally do not maintain

- No hand-written `Repo_Current_State.md`; derive state from the repo, git, package metadata, CI, and deployments.
- No Markdown ticket ledger or known-issues ledger once GitHub issues exist.
- No generic prompt playbook; `AGENTS.md`, linked context, and clear issue acceptance criteria are the durable interface.
- No universal manual-verification document; verification belongs with the workflow and each change's acceptance criteria.
- No completion-report template that rewards verbosity. The handoff should be concise but evidence-backed.

## GitHub templates

The repository includes issue and pull-request templates under `.github/`. They are prompts for useful evidence, not permission boundaries. Omit sections that genuinely do not apply; do not invent content to fill a template.
