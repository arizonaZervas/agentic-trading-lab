# Architecture direction

**Status:** TypeScript domain, CSV input adapter, and local CLI accepted; production data source, broker, UI, persistence, scheduler, and deployment adapters deferred

## Default shape

Start as a modular monolith: one repository and runtime with clear internal boundaries around domain logic. The current entry point is a local CLI. Add a web application, scheduled worker, or relational database only when the validated workflow requires it. This minimizes operational surface area while preserving a path to add independently deployed adapters if timing, secret-isolation, or reliability requirements justify them.

For the trading laboratory, keep strategy rules, simulation, performance comparison, and risk policy in pure, framework-independent TypeScript modules. Inputs and outputs should be explicit data structures. Tests must cover calendar boundaries, look-ahead prevention, costs, units, caps, stale/invalid input, and reproducibility. CLI, market-data, persistence, scheduler, UI, and broker code may call the domain; the domain must not import them.

## Accepted initial stack

The research prototype uses:

- **Language/runtime:** Strict TypeScript on Node.js 24 or newer. TypeScript reduces context switching across a possible future web surface, but runtime validation remains mandatory at file, network, and broker boundaries.
- **Shape:** `src/domain` contains deterministic rules and simulation; `src/adapters` contains external data parsing; `src/cli.ts` composes them.
- **Input:** Local CSV containing `SPY` on every symbol row, raw close, adjusted close, optional raw open, and externally verified month-end and first-session markers. Core-plus-dip requires raw open and derives adjusted open using the row's close adjustment factor. Domain entry points revalidate symbols, dates, ordering, prices, and marker types so future non-CSV adapters cannot bypass the boundary. This is intentionally replaceable because a licensed market-data source, exchange-calendar adapter, and corporate-action policy have not been selected.
- **Persistence:** None. Results go to standard output and no personal or brokerage data is stored.
- **Verification:** Strict TypeScript checking, Node's test runner, and the foundation check.
- **Strategies:** `SPY_TREND_10_MONTH_V1` and `SPY_CORE_PLUS_DIP_V1` are frozen, separate deterministic domain modules sharing performance metrics and the same buy-and-hold comparison contract. See [ADR 0006](decisions/0006-core-plus-dip-research-candidate.md) and [ADR 0007](decisions/0007-freeze-slow-trend-baseline.md).
- **Safety:** No broker dependency, credential, or live-order code. See [ADR 0003](decisions/0003-trading-automation-safety-boundary.md).

## Deferred candidates

- **Approval UI:** A minimal authenticated, phone-friendly approval surface is now required before live execution. Next.js App Router and React remain leading candidates, but the notification transport and hosting platform are deferred until their authentication, expiry, audit, delivery-failure, and secret-isolation properties are evaluated. A broader dashboard is not required for the first approval loop.
- **Database:** PostgreSQL is the default candidate once durable shared state or audit history is necessary. Schema intent must be migrations, and database access stays behind server-side boundaries.
- **Managed backend:** Supabase is a candidate only if its bundled Auth/Storage/Postgres reduces proven scope. Plain managed Postgres remains simpler when the bundle is unnecessary.
- **Deployment:** Vercel remains a candidate for a future web UI. A market-calendar-aware scheduled worker may require a different runtime with stronger timing, retry, and kill-switch behavior.
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
- **Scheduler:** How are exchange holidays, partial sessions, retries, duplicate runs, stale prices, and missed executions handled?
- **Persistence/auth:** Does the workflow need shared durable state or multiple users, and what private financial data enters scope?
- **Notification/approval:** Which phone transport provides authenticated single-use approve/reject actions, expiry, redaction, delivery/action audit, and a secure fallback when delivery fails?
- **Web/deployment:** What is the smallest authenticated approval surface, and do its availability, cost, and regional constraints fit the first year?

See [ADR 0002](decisions/0002-initial-stack-direction.md), [ADR 0003](decisions/0003-trading-automation-safety-boundary.md), [ADR 0005](decisions/0005-human-approved-etf-order-workflow.md), [ADR 0006](decisions/0006-core-plus-dip-research-candidate.md), and [ADR 0007](decisions/0007-freeze-slow-trend-baseline.md).
