# Agentic trading strategy lab

This repository is the starting point for a long-lived, transparent personal trading-strategy laboratory. It backtests two deterministic SPY candidates: the original slow-trend baseline and a fixed-capital core-plus-dip rule. Ordinary SPY buy-and-hold remains the benchmark. The repository emits paper-only, human-reviewable output and contains no broker order path.

## Current phase

**Research prototype with external shadow operations.** The user, first workflow, trust boundary, and TypeScript direction are documented. [ADR 0006](docs/decisions/0006-core-plus-dip-research-candidate.md) freezes the core-plus-dip v1 experiment, and [ADR 0007](docs/decisions/0007-freeze-slow-trend-baseline.md) freezes the original trend baseline; neither declares a winner. Broker and notification connections have been smoke-tested outside the repository, including one manually reviewed small SPY integration order that does not count as a strategy signal. [ADR 0009](docs/decisions/0009-morning-core-plus-dip-candidate.md) replaces ADR 0008's active post-close evaluation with a combined, read-only Tuesday/Friday 6:35 AM Pacific report based on the immediately prior completed NYSE close. Strategy-driven live trading remains disabled, and every future order still requires exact human approval under [ADR 0005](docs/decisions/0005-human-approved-etf-order-workflow.md).

Start here:

1. [Product brief](docs/product-brief.md) - what we need to learn before choosing the product and architecture.
2. [Architecture](docs/architecture.md) - principles, a proposed default stack, and the decisions still open.
3. [Frontend mental model](docs/frontend-mental-model.md) - browser architecture explained for a backend engineer.
4. [Deployment mental model](docs/deployment-mental-model.md) - how domains, builds, runtimes, data, and releases fit together.
5. [Delivery](docs/delivery.md) - how Codex and the owner will plan, implement, verify, and ship work.
6. [Codex setup](docs/codex-setup.md) - verified tools, plugin policy, and smoke-test evidence.
7. [Decision records](docs/decisions/README.md) - why consequential choices were made.
8. [AGENTS.md](AGENTS.md) - durable instructions Codex must follow in this repository.

## Run the laboratory

Use Node.js 24 or newer. Every input CSV row must contain `symbol=SPY`, ascending `date`, raw `close`, dividend/split-adjusted `adjusted_close` (or `Adj Close`), and externally verified `is_month_end` and `is_first_session_of_month` booleans. The core-plus-dip backtest additionally requires raw `open`; its adjusted-open total-return reference is derived from that row's close adjustment factor.

```bash
npm install
npm run check
npm run backtest -- --csv /absolute/path/to/prices.csv
npm run backtest:core-dip -- --csv /absolute/path/to/prices.csv
npm run report:core-dip -- --snapshot /absolute/path/to/spy-snapshot.json --experiment-start YYYY-MM-DD
npm run report:core-dip:morning -- --snapshot /absolute/path/to/spy-morning-snapshot.json --experiment-start YYYY-MM-DD
npm run signal -- --csv /absolute/path/to/prices.csv --confirmed-month-end YYYY-MM-DD
```

The checked-in `core-dip.config.json` fixes a $60 SPY core, $40 reserve, $10 tranches at 2%, 5%, 8%, and 12% below the rolling 20-session adjusted-close high, and Tuesday/Friday evaluation. Each tier is usable once because v1 has no selling or reserve replenishment. Orders are simulated at the next observed session's open. `test/fixtures/core-dip-synthetic.csv` is only a CLI smoke fixture, not market evidence.

`--confirmed-month-end` must exactly match the latest CSV date. It is intentionally explicit because the prototype has no exchange-calendar adapter. Signal and backtest output are for review and never broker orders.

The original close-evaluation command keeps its schema-v1 snapshot contract: `symbol`, an RFC 3339 `fetchedAt`, an `officialClose` object (`date`, numeric `price`, `interpolated: false`, and `source`), and ascending `bars` containing `date`, numeric dividend-adjusted `adjustedClose`, and optional `interpolated`. It still requires that day's completed close from a recognized SIP source within 60 minutes.

The morning command uses a distinct schema-v2 snapshot with `reportDate`, `priorOfficialClose`, `adjustedHistoryProvenance`, and `openingReference` in addition to `symbol`, `fetchedAt`, and `bars`. `priorOfficialClose.price` is the raw SIP-settled value retained for provenance. The snapshot also records Robinhood's raw and adjusted quote-reference pair, derives a corporate-action factor from that pair, and applies the factor to the official SIP price to produce `adjustedPrice` for the strategy and overnight-gap calculation. The adapter rechecks both equations with a tight relative tolerance. Adjusted history must come from Robinhood regular-session `4hour` bars requested with `adjustment_type: "all"` and aggregated by taking the last regular bar for each session date. The opening reference records `beginsAt`, `price`, positive `volume`, `interval: "minute"`, `bounds: "regular"`, `session: "reg"`, `interpolated: false`, and fixed Robinhood-historicals provenance. It requires the immediately prior completed NYSE session close, complete expected sessions in the supported 2026-2028 calendar, and a completed one-minute bar beginning at exactly 6:30:00 AM Pacific. The adapter rejects non-SPY, unordered, stale, future, incomplete, unit-mismatched, malformed-calendar, weekend, closure-day, or interpolated input; the final adjusted-close bar must exactly match `adjustedPrice`, never the raw official price by assumption. The opening bar is context only: it cannot change the signal or stable proposal keys and is never a retroactive opening fill. Both commands explicitly create no live intent or broker order. Local snapshots and order journals belong under ignored `.trading-state/`, never in Git.

## Near-term outcome

Validate a reliable total-return data set, pre-register train/test windows and cost sensitivities, and compare the frozen candidates with same-window SPY buy-and-hold while the read-only morning shadow schedule collects operational evidence. Allowlisting `QQQ`, `SMH`, and `SCHD` permits later evaluation but is not itself a trade signal. Live strategy mode remains disabled until the activation sequence and approval-flow tests pass.

## Repository status

- The canonical public remote is [arizonaZervas/agentic-trading-lab](https://github.com/arizonaZervas/agentic-trading-lab); the first honest research-prototype checkpoint is version `v0.1.0`.
- The dependency-light TypeScript strategy lab, strict type check, deterministic shadow report, and domain/adapter/CLI tests are present.
- `strategy.config.json` and `core-dip.config.json` enforce paper-only mode and a $100 research cap.
- GitHub Actions checks type safety, tests, and repository-foundation hygiene on pushes to `main` and pull requests.
- `.codex/config.toml` restricts Robinhood to seven read-only account/market tools for every fresh task in this project; a fresh-process smoke test confirmed equity review, placement, and cancellation are absent. Until the authenticated approval adapter exists, any manually approved broker write must run outside this project boundary.
- Playwright MCP is configured globally for browser verification.
- The official OpenAI developer-docs MCP has been added globally and successfully exercised from a fresh, read-only Codex process.
- Nineteen plugins are currently enabled globally; the resulting skills-budget warning and recommended pruning policy are documented in [Codex setup](docs/codex-setup.md).
- The official shadcn/ui project skill is installed under `.agents/skills/shadcn` and will activate after a future app creates `components.json`.
- `sample-system-flow.excalidraw` is a generic pre-product architecture sketch retained for reference; it is not the accepted trading-lab architecture.

The repository is publicly visible but does not yet grant a project-wide open-source license. Vendored material and its license are identified in [Third-party notices](THIRD_PARTY_NOTICES.md). The `"private": true` field in `package.json` prevents accidental npm publication; it does not control GitHub visibility.

## Foundation check

Run `./scripts/check-foundation.sh` to verify required setup files, local Markdown links, whitespace, and repository hygiene before application-specific checks exist.
