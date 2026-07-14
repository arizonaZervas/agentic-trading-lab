# ADR 0004: Bounded tiny-live trading phase

- **Status:** Superseded by [ADR 0005](0005-human-approved-etf-order-workflow.md)
- **Date:** 2026-07-12

## Context

The owner explicitly accepts the possible loss of the full $100 placed in a dedicated Robinhood Agentic account and authorizes building a bot that can place unattended live trades. The account is separate from the owner's main investing accounts.

Account separation limits where Robinhood permits the agent to place trades, but it does not fully isolate data: Robinhood documents that the connected agent can read account identifiers, positions, balances, and transactions across Robinhood accounts. A $100 funding cap also does not prevent duplicate orders, bad fills, privacy exposure, or operational churn.

The performance objective is positive after-cost excess total return versus same-period SPY buy-and-hold, not a fixed 8%-12% annual return.

**Supersession note:** ADR 0005 expands the explicit symbol allowlist and restores human approval as a requirement for every live order. The account, exposure, product, deterministic-decision, reconciliation, and kill-switch boundaries below remain in force.

## Decision

Authorize implementation of a tiny-live Robinhood adapter after the deterministic research and execution gates below pass. This decision authorizes the next build phase; it does not declare the current paper-only code live-ready or authorize bypassing its safety checks.

The first live policy is:

- one explicitly allowlisted Robinhood Agentic account;
- no bank transfers, deposits, withdrawals, or access-token sharing;
- long fractional equities/ETFs only, initially allowlisted to `SPY`;
- no options, margin, shorting, crypto, futures, or event contracts;
- no more than $100 gross market exposure, even if account profits increase its value;
- at most one new order for a unique monthly signal;
- deterministic strategy and risk code; no LLM-generated ticker, side, size, or timing;
- mandatory `review_equity_order` success before `place_equity_order`;
- persisted idempotency key and order-intent journal before placement;
- account, position, buying-power, quote-freshness, and market-session reconciliation before placement;
- post-order status/fill reconciliation and owner notification;
- a kill switch outside the LLM and live mode disabled by default; and
- fail closed on stale/missing data, account mismatch, unexpected holdings/orders, review warnings, timeouts, or ambiguous broker responses.

## Activation sequence

1. Connect the Robinhood MCP read-only and verify its surfaced tools and exact account metadata without placing an order.
2. Build and test a broker port plus a Robinhood adapter using recorded/fake responses, including duplicate, timeout, partial-fill, rejection, and reconciliation cases.
3. Run the live pipeline in review-only mode so it creates and journals an order intent but cannot call `place_equity_order`.
4. With the owner's confirmation at activation time, place one manually approved live order capped at $10 and reconcile the complete lifecycle.
5. Only after that lifecycle succeeds may unattended mode be explicitly armed for future policy-compliant orders, with the $100 exposure cap still enforced.

## Consequences

- The owner knowingly accepts up to $100 of market loss, but not unbounded operational behavior.
- The current `paperOnly: true` configuration remains unchanged until the live adapter and activation controls exist and pass verification.
- Beating the benchmark must be evaluated independently of whether the integration successfully places trades.
- Any expansion of symbols, products, exposure, frequency, or removal of the kill switch requires a new ADR and explicit owner approval.
