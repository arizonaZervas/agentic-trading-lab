# ADR 0006: Core-plus-dip research candidate

- **Status:** Accepted
- **Date:** 2026-07-13

## Context

The original SPY 10-month moving-average rule is a transparent engineering baseline, but it can remain unchanged for weeks or months and is not aligned with the owner's intuition of maintaining long-term exposure while deploying cash during selloffs. Replacing that baseline without a fair comparison would turn preference into a conclusion. Repeatedly tuning dip thresholds on the same history would create the same backtest-overfitting risk the laboratory is meant to avoid.

The owner therefore wants a simple core-plus-dip candidate while keeping ordinary SPY buy-and-hold as the investable benchmark and letting after-cost evidence choose. The candidate must preserve the fixed $100 capital boundary and must not imply live-order authorization.

## Decision

Register `SPY_CORE_PLUS_DIP_V1` as a separate, paper-only research candidate. Do not replace or silently modify the existing slow-trend baseline.

The checked-in v1 configuration is frozen as follows:

- one fixed $100 capital pool with no later deposits;
- buy a $60 SPY core at the first eligible execution;
- retain $40 cash as four $10 envelopes;
- after each observed Tuesday and Friday close, measure the percentage decline from the highest adjusted close in the latest 20 trading rows, including the current row;
- authorize one $10 envelope when each of the 2%, 5%, 8%, and 12% tiers is first reached or crossed;
- when one close crosses several unused tiers, aggregate those envelopes into one dip order;
- simulate each signal at the next observed session's raw open with configured slippage and fixed per-order fees;
- skip a Tuesday or Friday market holiday rather than inventing a substitute evaluation day; and
- never sell or replenish the reserve in v1, so each tier is usable only once and the strategy becomes ordinary buy-and-hold after all cash is deployed.

Require every input row to identify its symbol as `SPY`; reject missing or mismatched provenance rather than trusting a filename. Compare the candidate with ordinary SPY buy-and-hold using the same $100, signal/start date, next-session open, end date, adjusted total-return valuation, and cost model. Report excess total and annualized return, maximum-drawdown advantage, and both trade ledgers. Do not select a winner from synthetic fixtures or in-sample tuning; pre-register evaluation windows before using a sealed out-of-sample history.

This ADR expands the research cadence beyond ADR 0003's initial month-end fixture. It does not change the broker allowlist, human-approval requirement, exposure cap, or lack of live-order code.

## Alternatives considered

- **Replace the trend rule immediately:** rejected because it assumes the preferred story is correct before comparison.
- **Use SPY buy-and-hold as the strategy rather than the benchmark:** retained as the simplest investable default and hurdle, but it does not test whether holding tactical cash adds value.
- **Reset tiers after every recovery:** deferred because v1 has no sale or contribution rule to replenish its fixed reserve; repeated shallow-dip buys could consume money intended for deeper tiers.
- **Add profit-taking to rebuild the reserve:** deferred because it adds another timing rule and parameter family before the simple hypothesis is tested.
- **Evaluate daily or on news events:** deferred to avoid unnecessary turnover, subjective triggers, and a larger operational surface.

## Consequences

- The candidate is easy to reproduce and cannot risk more than its initial simulated $100.
- It can place at most one core order plus four tier envelopes; simultaneous tiers are one order. It is therefore a capital-deployment experiment, not a promise of perpetual trading activity.
- Holding cash can reduce drawdown during declines but can create persistent performance drag during uninterrupted rallies. Either candidate can win, which is visible in deterministic tests.
- A trustworthy open/close/adjusted-close data set and pre-registered walk-forward/out-of-sample protocol are required before the output is decision evidence.
- Any reset, sale, contribution, new threshold, lookback, symbol, or cadence is a new candidate version rather than a quiet change to v1.

## Validation or reversal signal

Advance this candidate only if it produces positive after-cost excess total return versus same-window SPY buy-and-hold on the sealed out-of-sample period, positive excess in a majority of pre-registered walk-forward windows, and maximum drawdown no more than five percentage points worse than the benchmark. Then require the operational shadow checks in the product brief before proposing any tiny-live use.

If it fails those gates, keep buy-and-hold as the default benchmark outcome and either stop or register a materially different hypothesis before inspecting another sealed test period. A favorable synthetic test or one historical crash is not validation.
