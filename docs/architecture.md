# Architecture direction

**Status:** TypeScript domain, CSV input adapter, local CLI, and local morning shadow-report automation accepted; production data source, live broker, UI, persistence, and deployment adapters deferred

## Default shape

Start as a modular monolith: one repository and runtime with clear internal boundaries around domain logic. The current entry point is a local CLI. Add a web application, scheduled worker, or relational database only when the validated workflow requires it. This minimizes operational surface area while preserving a path to add independently deployed adapters if timing, secret-isolation, or reliability requirements justify them.

For the trading laboratory, keep strategy rules, simulation, performance comparison, and risk policy in pure, framework-independent TypeScript modules. Inputs and outputs should be explicit data structures. Tests must cover calendar boundaries, look-ahead prevention, costs, units, caps, stale/invalid input, and reproducibility. CLI, market-data, persistence, scheduler, UI, and broker code may call the domain; the domain must not import them.

## Accepted initial stack

The research prototype uses:

- **Language/runtime:** Strict TypeScript on Node.js 24 or newer. TypeScript reduces context switching across a possible future web surface, but runtime validation remains mandatory at file, network, and broker boundaries.
- **Shape:** `src/domain` contains deterministic rules and simulation; `src/adapters` contains external data parsing; `src/cli.ts` composes them.
- **Input:** Local CSV containing `SPY` on every symbol row, raw close, adjusted close, optional raw open, and externally verified month-end and first-session markers. Core-plus-dip requires raw open and derives adjusted open using the row's close adjustment factor. Domain entry points revalidate symbols, dates, ordering, prices, and marker types so future non-CSV adapters cannot bypass the boundary. This is intentionally replaceable because a licensed market-data source, exchange-calendar adapter, and corporate-action policy have not been selected.
- **Persistence:** No shared or committed store. Results go to standard output; ignored `.trading-state/` may hold validated market snapshots, masked order-intent metadata, and automation receipts. Credentials and full account identifiers must never be written there or committed.
- **Verification:** Strict TypeScript checking, Node's test runner, and the foundation check.
- **Strategies:** `SPY_TREND_10_MONTH_V1` and `SPY_CORE_PLUS_DIP_V1` remain frozen, separate deterministic domain modules sharing performance metrics and the same buy-and-hold comparison contract. `SPY_CORE_PLUS_DIP_MORNING_V1` is a distinct operational candidate that copies the core-plus-dip parameters but observes the immediately prior completed session close on Tuesday/Friday mornings. See [ADR 0006](decisions/0006-core-plus-dip-research-candidate.md), [ADR 0007](decisions/0007-freeze-slow-trend-baseline.md), and [ADR 0009](decisions/0009-morning-core-plus-dip-candidate.md).
- **Shadow operations:** One local Codex automation runs Tuesday and Friday at 6:35 AM `America/Los_Angeles` and combines prior-session candidate evaluation with read-only order reconciliation. A Monday/Wednesday/Thursday reconciliation check emails only when an approved order is outstanding or changed. The adapter validates the current NYSE session is open and retains the immediately prior raw SIP-settled close for provenance. It derives a corporate-action factor from Robinhood's raw and adjusted prior-quote pair, applies that factor to the official SIP price, and uses the resulting adjusted price for the signal. The 20-session adjusted series comes from Robinhood regular-session `4hour` history requested with `adjustment_type=all`. The adapter verifies complete sessions against the published 2026-2028 NYSE full-day closure calendar and accepts only a fresh, completed, non-interpolated Robinhood regular-session one-minute bar beginning at exactly 6:30:00 AM Pacific as the opening reference. That opening bar is context, never a signal or retroactive opening fill. Repository-scoped `.codex/config.toml` exposes only the seven Robinhood read tools required by these jobs to every fresh project task; a fresh-process smoke test confirmed review, placement, and cancellation are absent. `get_accounts` necessarily enumerates account metadata to resolve the one accessible Agentic account, after which portfolio, position, and order-detail reads are restricted to that account. The prompts independently fail closed if that capability surface drifts. See [ADR 0008](decisions/0008-local-shadow-report-automation.md) and [ADR 0009](decisions/0009-morning-core-plus-dip-candidate.md).
- **Safety:** Repository code has no broker dependency, credential, or live-order path. The external shadow automation fails closed on stale, interpolated, incomplete, ambiguous, late, untradable, halted, or unavailable market/account input; its email is reporting, not trade approval. Because the read-only MCP allowlist applies to the whole project, any interim manually approved broker write must run outside this project until the authenticated approval adapter exists. Any live order still needs a new current quote, broker review, and exact owner approval. See [ADR 0003](decisions/0003-trading-automation-safety-boundary.md), [ADR 0008](decisions/0008-local-shadow-report-automation.md), and [ADR 0009](decisions/0009-morning-core-plus-dip-candidate.md).

## Deferred candidates

- **Approval UI:** A minimal authenticated, phone-friendly approval surface is now required before live execution. Next.js App Router and React remain leading candidates, but the notification transport and hosting platform are deferred until their authentication, expiry, audit, delivery-failure, and secret-isolation properties are evaluated. A broader dashboard is not required for the first approval loop.
- **Database:** PostgreSQL is the default candidate once durable shared state or audit history is necessary. Schema intent must be migrations, and database access stays behind server-side boundaries.
- **Managed backend:** Supabase is a candidate only if its bundled Auth/Storage/Postgres reduces proven scope. Plain managed Postgres remains simpler when the bundle is unnecessary.
- **Deployment:** Vercel remains a candidate for a future web UI. The accepted local morning automation is best-effort and has no uptime guarantee when the host is asleep/offline or connectors are unavailable; a market-calendar-aware hosted worker remains deferred and would require stronger timing, retry, duplicate-run, and recovery behavior.
- **Browser verification:** Playwright will be required when a user-visible browser flow exists.

## What Vercel and Supabase actually do

Think of a domain registrar, application platform, and database platform as separate layers:

- A **domain registrar** leases a human-readable name such as `example.com`. A DNS provider maps that name to services. Vendors such as GoDaddy may sell registrar, DNS, site-builder, and hosting products, but buying a domain does not itself run an application.
- **Vercel** connects to source control, builds the web application, runs its server-side functions, serves static assets through a delivery network, manages environment-specific configuration, and gives branches/commits preview URLs. It can also attach a custom domain. It is closer to a specialized web application runtime plus CI/CD and CDN than to merely buying web space.
- **Supabase** provisions a Postgres database and can bundle authentication, generated APIs, file storage, realtime features, and serverless functions. It is closer to an application backend platform than only a database host. That convenience creates security work at the database/API boundary, especially grants and row-level security.

Neither Vercel nor Supabase is selected or automatically required. A Next.js app can run elsewhere; Postgres can run elsewhere; a domain can be registered elsewhere. Choose each layer independently enough to understand the coupling.

## Non-negotiable qualities

- **Correctness:** Deterministic domain logic and explicit runtime validation at every external boundary.
- **Security and privacy:** Least privilege, server-side authorization, secret isolation, data minimization, dependency scanning, and tested denial paths.
- **Accessibility:** Keyboard operation, semantic structure, readable contrast, and automated plus manual accessibility checks.
- **Operability:** Structured logs without sensitive data, health signals, error tracking, backups for durable data, migration rollback/forward-fix plans, and a documented recovery path.
- **Performance:** Define budgets from user experience; measure before introducing caches or distributed components.
- **Portability:** Business rules do not depend on a hosting vendor. Accept some framework/platform coupling at adapters when it buys meaningful speed.

## Adapter decision gates

Before adding the corresponding surface, answer:

- **Market data:** What license, adjustment method, revision behavior, freshness SLA, and outage fallback are acceptable?
- **Broker:** What exact read/write scope, idempotency contract, review behavior, account cap, reconciliation path, external kill switch, and intent-bound approval handoff exist?
- **Scheduler:** The local shadow adapter recognizes published 2026-2028 full-day NYSE closures, selects the immediately prior completed session, validates the exact opening-minute historical bar, rejects stale, incomplete, late, weekend, unrecognized-source, ambiguous, or interpolated data, and treats missed or duplicate runs as evidence failures. Dates beyond that bounded calendar fail closed until it is deliberately extended. Before adopting a hosted or execution-capable scheduler, decide unscheduled closures, delayed opens, partial sessions, retry, deduplication, recovery, and kill-switch behavior.
- **Persistence/auth:** Does the workflow need shared durable state or multiple users, and what private financial data enters scope?
- **Notification/approval:** Which phone transport provides authenticated single-use approve/reject actions, expiry, redaction, delivery/action audit, and a secure fallback when delivery fails?
- **Web/deployment:** What is the smallest authenticated approval surface, and do its availability, cost, and regional constraints fit the first year?

See [ADR 0002](decisions/0002-initial-stack-direction.md), [ADR 0003](decisions/0003-trading-automation-safety-boundary.md), [ADR 0005](decisions/0005-human-approved-etf-order-workflow.md), [ADR 0006](decisions/0006-core-plus-dip-research-candidate.md), [ADR 0007](decisions/0007-freeze-slow-trend-baseline.md), [ADR 0008](decisions/0008-local-shadow-report-automation.md), and [ADR 0009](decisions/0009-morning-core-plus-dip-candidate.md).
