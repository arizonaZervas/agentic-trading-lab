# Product brief

**Status:** Paper-only research prototype built; bounded tiny-live implementation authorized but not connected or activated

## Product thesis

Build a transparent personal strategy laboratory for the owner to test and operate a small, rules-based trading workflow without trusting influencer claims or giving an LLM uncontrolled brokerage access. The research succeeds only if it produces reproducible, after-cost evidence of outperforming an investable S&P 500 proxy without materially worse drawdown; it does not promise a monthly income.

The initial $100 is a maximum future risk budget, not evidence that $100-$200 of monthly profit is feasible. No live funds or broker credentials enter the first slice.

## Discovery answers

1. **First user:** The owner, a US self-directed investor experimenting with a separate Robinhood Agentic account.
2. **Painful job:** Turn a trading hypothesis into a repeatable, cost-aware decision and audit trail without emotional execution, opaque software, or free-form AI orders.
3. **Smallest useful workflow:** Load symbol-bound daily open, close, and adjusted-close data, run frozen deterministic candidates over identical windows, compare each with SPY buy-and-hold, and emit paper-only results with trades, inputs, and assumptions. The original month-end rule can also emit a target-allocation proposal.
4. **Trust boundary:** The first slice is local and stores only market data and simulated results. It has no Robinhood token, account number, personal data, or order-placement capability. The authorized next phase connects a specifically allowlisted Agentic account, but Robinhood's MCP can expose account identifiers, positions, balances, and transaction history across Robinhood accounts. Secrets, account verification, order idempotency, reconciliation, and the kill switch therefore remain trusted boundaries.
5. **Decision posture:** Self-directed educational/research software. It must not describe projections as guaranteed returns or silently turn LLM output into a trade.
6. **Success signal:** On a sealed out-of-sample period, a frozen candidate has positive after-cost excess total return versus same-period SPY buy-and-hold, has positive excess return in a majority of predefined walk-forward windows, and does not exceed the benchmark's maximum drawdown by more than a provisional five percentage points. Scheduled shadow operation must also complete 60 consecutive checks spanning at least 12 weeks and three month ends without stale/duplicate/audit failures, and the owner must be able to independently reproduce each proposal.
7. **Learning goal:** Balance dependable domain engineering with later frontend/deployment learning. Correctness and observability come before a dashboard.
8. **Operating constraints:** No incremental hosted-service cost during the research slice; at most 15 minutes of weekly owner attention; at most $100 combined gross live market exposure in the dedicated Agentic account; every live order requires an authenticated, intent-bound owner approval; no automatic funding, leverage, options, shorting, crypto, or intraday activity.

## Questions to answer before application scaffolding

1. **First user:** Is the first version for the owner/family, invited users, or the public?
2. **Painful job:** What decision does the user make today, and why are spreadsheets or existing products inadequate?
3. **Smallest useful workflow:** What single input-to-decision loop is valuable without accounts, collaboration, payments, or AI?
4. **Trust boundary:** Will the product store names, balances, income, account identifiers, tax data, or other sensitive information? Could the first version use synthetic data or local-only persistence?
5. **Decision posture:** Is the tool educational/scenario-planning software, or could a user reasonably interpret its output as personalized financial advice?
6. **Success signal:** What observable behavior within four weeks would justify another month of work?
7. **Learning goal:** Should we optimize first for speed to a dependable product, for learning frontend internals, or for a deliberate balance?
8. **Operating constraints:** What monthly budget and on-call/maintenance burden are acceptable?

## Selected first slice

- A deterministic TypeScript engine preserves the published slow-trend baseline and adds the frozen `SPY_CORE_PLUS_DIP_V1` candidate in [ADR 0006](decisions/0006-core-plus-dip-research-candidate.md).
- CLI commands validate daily CSV input, run cost-aware backtests over identical strategy/benchmark windows, and compare each candidate with ordinary SPY buy-and-hold.
- A second CLI path emits a month-end target-allocation proposal only after explicit month-end confirmation.
- The output states assumptions and never places a broker order.
- Tests prove next-session execution, Tuesday/Friday cadence, one-time tier and reserve behavior, slippage and fixed fees, benchmark neutrality, date-bound month-end confirmation, input validation, the $100 research cap, and the absence of a live mode.

Non-goals of this code slice are parameter optimization, a screener, news/social sentiment, LLM forecasting, a web UI, persistence, live/unattended scheduling, Robinhood connectivity, and live trading. A paper/shadow scheduler is permitted as the next step because it is required to gather the operational evidence in [the research report](research/trading-agent-discovery.md).

## Authorized next phase

The owner accepts the possible loss of the dedicated account's full $100 and authorizes building live orders only through a per-order human approval loop. [ADR 0004](decisions/0004-bounded-tiny-live-trading.md) defines the base account, product, exposure, reconciliation, and kill-switch boundaries; [ADR 0005](decisions/0005-human-approved-etf-order-workflow.md) supersedes its symbol and unattended-execution provisions. The initial exact ETF allowlist is `SPY`, `QQQ`, `SMH`, and `SCHD`. The existing paper-only mode remains the default until the controls, authenticated phone approval surface, and broker adapter are implemented and verified.

## Idea selection scorecard

Use this only to structure judgment, not manufacture certainty. Score each criterion from 1 (weak) to 5 (strong), attach one sentence of evidence, and multiply by the weight. For risk criteria, a high score means lower risk or burden.

| Criterion | Weight | Evidence question |
| --- | ---: | --- |
| Pain and frequency | 3 | Does a specific user face this often enough and care enough to change behavior? |
| Access to users | 3 | Can we observe or interview at least five plausible users without paid acquisition? |
| Small first value loop | 3 | Can one input-to-decision workflow provide value in two to four weeks? |
| Owner insight | 2 | Do domain experience, lived experience, or unusual access improve the solution? |
| Personal motivation | 2 | Will the owner still care after the novelty of scaffolding disappears? |
| Data and regulatory safety | 3 | Can the first slice avoid sensitive data, regulated advice, or high-consequence automation? |
| Integration independence | 2 | Can the first value be demonstrated without fragile third-party integrations? |
| Operating simplicity | 2 | Can one person support it with modest cost and no permanent on-call burden? |
| Distribution path | 2 | Is there a credible way for the first ten users to discover it? |
| Willingness to pay or strategic value | 1 | Is there evidence of economic value, even if monetization is not immediate? |

Any of these are red flags regardless of total score:

- We cannot name or reach the first user.
- The product is only useful after importing highly sensitive real data.
- Incorrect output could cause material harm and we lack a credible validation/review model.
- The first value requires several external integrations or a marketplace/network effect.
- We are choosing it mainly because the stack is interesting.

### Candidate comparison

| Candidate | User and painful job | Smallest value loop | Evidence collected | Main risk | Decision |
| --- | --- | --- | --- | --- | --- |
| Household financial scenarios | A household deciding whether long-term goals are mutually affordable | Enter synthetic assumptions and inspect a transparent projection with sensitivities | Owner experience only; user validation pending | Trust, advice boundary, calculation correctness, sensitive data | Explore |
| Personal trading strategy laboratory | Owner wants a reproducible alternative to opaque bot and influencer claims | Backtest frozen deterministic candidates and emit paper-only results/proposals | Cross-platform research, primary broker/rule docs, published strategy and overfitting research | Financial loss, overfitting, stale data, uncontrolled agent actions | **Selected for research prototype** |
| Candidate 3 | | | | | |

## Evidence log

Add dated interview notes, prototype observations, and decisions here or link to a durable source. Separate facts from hypotheses.

- **2026-07-12:** Owner identified the desired user, a $100 risk budget, Robinhood Agentic Trading as a possible future adapter, and a hoped-for $100-$200 monthly outcome. The return target is treated as an unsupported hypothesis, not an acceptance criterion.
- **2026-07-12:** [Cross-platform discovery research](research/trading-agent-discovery.md) found useful architecture and failure evidence but no audited source supporting the target return. Selected a deterministic, paper-only first slice.
- **2026-07-12:** Owner corrected the performance objective: success means beating the S&P 500, not earning $100-$200 monthly from $100. The executable benchmark is same-period SPY buy-and-hold total return after equivalent entry costs; 8%-12% is not treated as a guaranteed annual hurdle.
- **2026-07-12:** Owner explicitly accepted the possible loss of the dedicated Agentic account's full $100 and authorized building a bot that can place live trades. This authorizes the bounded implementation in [ADR 0004](decisions/0004-bounded-tiny-live-trading.md), not immediate activation of the current paper-only prototype.
- **2026-07-12:** Owner expanded the intended major-ETF universe to the exact initial allowlist `SPY`, `QQQ`, `SMH`, and `SCHD`, and required a phone notification with rationale plus explicit approval before every live order. [ADR 0005](decisions/0005-human-approved-etf-order-workflow.md) records the intent-bound approval workflow; unattended execution is no longer authorized.
- **2026-07-13:** Owner chose `SPY_CORE_PLUS_DIP_V1` as a second candidate while retaining ordinary SPY buy-and-hold as the benchmark and the slow-trend rule as a separate baseline. The choice registers an experiment, not a claim that buying dips outperforms; same-window after-cost evidence must decide.
