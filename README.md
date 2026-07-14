# Agentic trading strategy lab

This repository is the starting point for a long-lived, transparent personal trading-strategy laboratory. It now backtests two deterministic SPY candidates: the original slow-trend baseline and a fixed-capital core-plus-dip rule. Ordinary SPY buy-and-hold remains the benchmark. The laboratory emits paper-only, human-reviewable output and cannot place an order.

## Current phase

**Research prototype.** The user, first workflow, trust boundary, and TypeScript direction are documented. [ADR 0006](docs/decisions/0006-core-plus-dip-research-candidate.md) freezes the core-plus-dip v1 experiment, and [ADR 0007](docs/decisions/0007-freeze-slow-trend-baseline.md) freezes the original trend baseline; neither declares a winner. A bounded tiny-live phase is authorized, with the human-approved ETF workflow in [ADR 0005](docs/decisions/0005-human-approved-etf-order-workflow.md), but no Robinhood connection, notification surface, or live-order code exists yet. Strategy optimization and live scheduling are not implemented. A paper/shadow scheduler is an allowed next evidence step.

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
npm run signal -- --csv /absolute/path/to/prices.csv --confirmed-month-end YYYY-MM-DD
```

The checked-in `core-dip.config.json` fixes a $60 SPY core, $40 reserve, $10 tranches at 2%, 5%, 8%, and 12% below the rolling 20-session adjusted-close high, and Tuesday/Friday evaluation. Each tier is usable once because v1 has no selling or reserve replenishment. Orders are simulated at the next observed session's open. `test/fixtures/core-dip-synthetic.csv` is only a CLI smoke fixture, not market evidence.

`--confirmed-month-end` must exactly match the latest CSV date. It is intentionally explicit because the prototype has no exchange-calendar adapter. Signal and backtest output are for review and never broker orders.

## Near-term outcome

Validate a reliable total-return data set, pre-register train/test windows and cost sensitivities, and compare both frozen candidates with same-window SPY buy-and-hold. Only then should the evidence select a candidate for shadow scheduling. Allowlisting `QQQ`, `SMH`, and `SCHD` permits later evaluation but is not itself a trade signal. Live mode remains disabled until the activation sequence and approval-flow tests pass.

## Repository status

- The canonical public remote is [arizonaZervas/agentic-trading-lab](https://github.com/arizonaZervas/agentic-trading-lab); the first honest research-prototype checkpoint is version `v0.1.0`.
- The dependency-light TypeScript strategy lab, strict type check, and twenty-three domain/adapter tests are present.
- `strategy.config.json` and `core-dip.config.json` enforce paper-only mode and a $100 research cap.
- GitHub Actions checks type safety, tests, and repository-foundation hygiene on pushes to `main` and pull requests.
- Playwright MCP is configured globally for browser verification.
- The official OpenAI developer-docs MCP has been added globally and successfully exercised from a fresh, read-only Codex process.
- Nineteen plugins are currently enabled globally; the resulting skills-budget warning and recommended pruning policy are documented in [Codex setup](docs/codex-setup.md).
- The official shadcn/ui project skill is installed under `.agents/skills/shadcn` and will activate after a future app creates `components.json`.
- `sample-system-flow.excalidraw` is a generic pre-product architecture sketch retained for reference; it is not the accepted trading-lab architecture.

The repository is publicly visible but does not yet grant a project-wide open-source license. Vendored material and its license are identified in [Third-party notices](THIRD_PARTY_NOTICES.md). The `"private": true` field in `package.json` prevents accidental npm publication; it does not control GitHub visibility.

## Foundation check

Run `./scripts/check-foundation.sh` to verify required setup files, local Markdown links, whitespace, and repository hygiene before application-specific checks exist.
