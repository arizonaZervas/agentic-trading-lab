# Repository guidance

## Mission and phase

Build a maintainable full-stack product while helping a backend/distributed-systems expert develop sound frontend and deployment judgment. The repository is a research prototype with a documented user, problem, trust boundary, and first useful workflow. Do not scaffold a web application or add production infrastructure until evidence from that workflow identifies the next required boundary.

## Start every task

1. Read `README.md`, `docs/product-brief.md`, `docs/architecture.md`, and `docs/delivery.md` as relevant. Use the frontend and deployment mental-model docs when work crosses those boundaries; read `docs/codex-setup.md` before changing Codex configuration, plugins, skills, or MCP servers.
2. Read applicable ADRs under `docs/decisions/` before changing architecture or tooling.
3. Inspect the repository and current git diff; do not assume a document is current when code or configuration can prove the state directly.
4. State important assumptions and uncertainty. Ask only questions whose answers would materially change the work; make reversible assumptions for the rest.

## Code discovery

- Use codebase-memory-mcp graph tools for structural questions such as symbol discovery, callers, dependencies, routes, and architecture. Confirm the project is indexed and current with `list_projects`, `index_status`, or `detect_changes` before relying on graph results.
- Use `rg`, direct source inspection, and git for exact text, configuration, documentation, generated files, uncommitted changes, and anything absent from or newer than the index. Treat the graph as a derived search index, not a source of truth.
- Run `index_repository` after a substantial scaffold, branch switch, dependency-layout change, or when freshness is uncertain. Automatic indexing and watching reduce routine work but do not replace freshness checks for consequential decisions.

## Context and token discipline

- Keep the main context focused on decisions, constraints, and compact evidence. Do not absorb or return bulk when a targeted query or bounded summary will answer the question.
- Preserve a stable, append-only context within a coherent task so prompt caching can be reused. Prefer one complete brief over repeated steering, and avoid changing durable instructions, skills, or tool configuration mid-task unless the outcome requires it.
- Discover structure through the codebase graph before broad scans. Read only the relevant source, tests, types, and one comparable pattern; expand outward only when evidence is insufficient.
- Bound tool output. Prefer focused diffs, exact matches, narrow test failures, and filtered logs over full repositories, dependency trees, generated files, or entire command transcripts. Review security, authorization, schema, payment, and destructive-operation evidence directly rather than relying only on summaries.
- Delegate only independent, bounded work that materially reduces main-context load or latency. Give each subagent the smallest self-contained brief and inherited history it needs, and require a conclusion-first handoff of roughly 1 KB or less with evidence pointers instead of raw file or log dumps.
- Keep durable project rules here and transient task state in the current prompt, Codex task, or GitHub issue. Do not turn `AGENTS.md` into a session log. When work shifts to a materially different workflow, recommend a fresh task with a compact handoff covering completed work, next action, blockers, and verification state.
- Token efficiency must not weaken correctness. Do not skip relevant tests, browser verification, negative authorization checks, migration review, or direct inspection of high-risk changes merely to reduce context usage.

## Scope and architecture

- Implement the requested outcome end to end; do not add speculative features.
- Preserve unrelated user changes and existing artifacts.
- Default to a modular monolith. Do not introduce microservices, queues, caches, event buses, or generic abstraction layers without an observed need and an ADR.
- Keep domain rules independent of UI frameworks, HTTP handlers, database clients, and deployment vendors.
- Treat all financial calculations as deterministic domain logic with explicit units, time assumptions, rounding rules, and tests. Never present projections as guarantees.
- Keep authorization on trusted server/database boundaries. Client-side visibility checks are not authorization.
- Changes to dependencies, persistence, authentication, public APIs, or deployment architecture require explicit rationale. Prefer mature, well-supported dependencies and commit lockfiles.
- Database schema changes must be reproducible migrations committed to the repository. Production data must never be the only copy of schema intent.

## Frontend quality bar

- Use semantic HTML and keyboard-accessible interactions; preserve visible focus and sensible heading order.
- Design and verify loading, empty, error, success, and permission-denied states where applicable.
- Check narrow mobile, typical laptop, and wide layouts. Avoid fixed dimensions that only work at one viewport.
- Keep server state, URL state, form state, and local presentation state distinct. Do not mirror derived state unnecessarily.
- Do not claim visual completion from source inspection alone. Run the app and inspect the relevant flow in a browser; use screenshots when visual judgment matters.
- Prefer a small, explicit design system and reusable primitives over one-off styling, but do not build a component library before repeated patterns exist.

## Verification and completion

- Verify in proportion to risk. Run the narrowest relevant checks first, then the broader suite required by `docs/delivery.md`.
- Bug fixes require a regression test when practical.
- User-visible workflows require browser verification; critical workflows require automated end-to-end coverage once the framework exists.
- Security-sensitive changes require negative tests proving forbidden access fails.
- Report the outcome, files changed, checks run and their results, remaining risks, and any manual verification still needed.
- Explain unfamiliar frontend or deployment concepts in backend analogies, including tradeoffs and failure modes. Do not hide uncertainty or overstate a platform's guarantees.

## Documentation discipline

- Keep durable facts here and in the smallest relevant document. Do not create status documents that duplicate git, the issue tracker, or CI.
- Record consequential, hard-to-reverse decisions as ADRs using `docs/decisions/template.md`.
- Update documentation in the same change when behavior, commands, architecture, or operating assumptions change.
- Use GitHub issues for work items and follow-ups once a remote repository exists. Acceptance criteria belong with the issue or change, not in a second ticket ledger.

## Commands

- Foundation validation: `./scripts/check-foundation.sh`
- Codebase index status: `codebase-memory-mcp cli list_projects`
- Rebuild the local codebase index: `codebase-memory-mcp cli index_repository --repo-path "$PWD" --mode full --persistence false`
- Install pinned dependencies: `npm install`
- Type-check: `npm run typecheck`
- Unit tests: `npm test`
- Full prototype check: `npm run check`
- Backtest: `npm run backtest -- --csv /absolute/path/to/prices.csv`
- Core-plus-dip backtest: `npm run backtest:core-dip -- --csv /absolute/path/to/prices.csv`
- Paper signal: `npm run signal -- --csv /absolute/path/to/prices.csv --confirmed-month-end YYYY-MM-DD`

No formatter, linter, production build, end-to-end test, migration, local service, scheduler, or live broker command exists yet. Do not guess one; add and document it when that surface is implemented.
