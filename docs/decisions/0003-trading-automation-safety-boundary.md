# ADR 0003: Trading automation safety boundary

- **Status:** Accepted; live-activation portion superseded by [ADR 0004](0004-bounded-tiny-live-trading.md)
- **Date:** 2026-07-12

**Supersession note:** ADR 0004 recorded the owner's later authorization for bounded unattended trading. [ADR 0005](0005-human-approved-etf-order-workflow.md) now restores human approval for every live order and expands the exact ETF allowlist; the deterministic decision, exposure, and safety boundaries remain in force.

## Context

Robinhood Agentic Trading can expose broad account data to an AI agent and can place orders without per-order confirmation. The owner wants to explore a bot with a maximum future live balance of $100. The initial monthly-profit hypothesis implied extraordinary returns; the owner later corrected success to benchmark-relative outperformance versus the S&P 500.

Backtest selection, stale data, duplicate execution, prompt injection, hallucinated instructions, and optimistic fill assumptions can all convert a software defect into irreversible financial loss.

## Decision

The first vertical slice is paper-only and contains no broker adapter or credential. Signal generation is deterministic domain logic. An LLM may later explain, monitor, or challenge a proposal, but it is not an authority for target allocation, risk limits, or order placement.

The initial strategy boundary is:

- long fractional equity/ETF exposure or cash;
- one symbol and at most 100% unlevered exposure;
- month-end evaluation and no intraday trading;
- no options, margin, shorting, crypto, or event contracts;
- raw and adjusted-price input with externally verified month-end/first-session markers plus explicit freshness and completeness checks;
- next-session simulated execution with costs; and
- a hard $100 research cap enforced by trusted code.

Live trading is a separate future decision. It requires explicit owner authorization, a reviewed broker adapter, idempotent order intents, stale-price rejection, broker-side pre-trade review, an external kill switch, reconciliation, and human approval for every order during the tiny-live phase.

## Consequences

- The prototype can falsify a strategy and prove operational behavior without risking funds.
- It cannot demonstrate real fills, broker availability, taxes, or live profitability.
- Progress may feel slower because the first useful output is evidence and a reviewable proposal rather than an autonomous trade.
- A future move to unattended order placement must supersede this ADR; changing a prompt or configuration flag is insufficient.
