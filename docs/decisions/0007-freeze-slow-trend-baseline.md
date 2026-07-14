# ADR 0007: Freeze the slow-trend baseline

- **Status:** Accepted
- **Date:** 2026-07-13

## Context

The original slow-trend backtest accepted arbitrary symbols and moving-average lengths even though the documented experiment was a SPY 10-month moving-average baseline. Tests also exercised a three-month variant. That flexibility made silent parameter tuning and mislabeled input possible, so results with different hypotheses could appear to belong to one candidate.

## Decision

Register the baseline as `SPY_TREND_10_MONTH_V1` and freeze its symbol at `SPY`, moving-average window at ten completed months, initial simulated cash at $100, and paper-only mode. Transaction-cost sensitivities may vary only within the validated configuration bounds and must be reported with the result.

Require every price row to carry explicit `SPY` provenance. Revalidate row dates, ordering, positive finite prices, and session-marker types at domain entry points even when an adapter has already validated them. Reject a completed calendar-month transition when the preceding observed row is not marked as month end. The prototype still relies on externally verified exchange-calendar markers and cannot prove that an otherwise absent trading session was omitted.

Compare this candidate with ordinary SPY buy-and-hold over the same evaluation window and cost model. Any other symbol, signal window, starting capital, or trading rule is a new named candidate and requires a new decision record rather than a quiet configuration change.

## Alternatives considered

- **Keep a generic configurable trend engine:** useful for exploration, but it permits unregistered hypothesis changes to masquerade as the baseline.
- **Remove the trend candidate:** rejected because it remains a transparent, independently motivated comparison for core-plus-dip.
- **Infer the symbol from a filename or command:** rejected because filenames are untrusted provenance.

## Consequences

- Backtest output identifies the candidate and echoes its validated configuration.
- CSV and future adapter inputs fail closed on missing, malformed, mismatched, or unordered rows.
- Pure strategy primitives may still accept a window parameter for focused algorithm tests, but public candidate entry points enforce the frozen protocol.
- Comparing candidates fairly still requires pre-registered common windows and a trusted market-calendar/data source.

## Validation or reversal signal

Keep this candidate only while identical inputs and cost assumptions reproduce identical results. Evaluate it on pre-registered walk-forward and sealed out-of-sample windows against same-period SPY buy-and-hold. A different window or symbol must be versioned as a separate experiment.
