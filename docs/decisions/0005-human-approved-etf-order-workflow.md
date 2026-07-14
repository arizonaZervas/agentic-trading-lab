# ADR 0005: Human-approved ETF order workflow

- **Status:** Accepted
- **Date:** 2026-07-12

## Context

ADR 0004 authorized a bounded tiny-live phase with `SPY` as the only initial symbol and allowed a later move to unattended execution. The owner now wants the strategy laboratory to consider several major ETFs and wants to learn from each proposal before accepting it. A phone notification and explicit approval for every order provide that feedback loop without delegating irreversible execution to an LLM.

"Major ETF" is not an executable risk rule. Liquidity, product structure, concentration, and strategy suitability differ even among popular funds, so the broker boundary needs an exact allowlist. A human approval is also only meaningful when it is bound to the exact reviewed order and cannot be replayed after its inputs change.

## Decision

Supersede ADR 0004's `SPY`-only and future-unattended provisions with a human-approved, configurable ETF policy.

The initial live symbol allowlist is exactly:

- `SPY` — broad US large-cap equity;
- `QQQ` — Nasdaq-100 equity;
- `SMH` — concentrated semiconductor equity; and
- `SCHD` — US dividend equity.

The allowlist is trusted configuration, versioned with the application, and enforced again in the broker adapter. An LLM cannot add a symbol or override the list. Adding or removing a fund requires explicit owner approval, a documented strategy/data review, and a configuration change with tests. Individual stocks and all ETFs not on the list remain denied.

Every live order requires this state transition:

1. Deterministic strategy and risk code creates a proposed order for an allowlisted symbol.
2. The system persists an immutable order intent and idempotency key before sending a notification.
3. The owner receives a phone notification containing the symbol, buy/sell side, fractional-dollar amount, current and resulting exposure, strategy evidence, assumptions or warnings, proposal ID, and expiry time. The explanation may be rendered in plain language by an LLM, but the underlying facts and order fields come from deterministic code.
4. The owner approves or rejects through an authenticated action. Approval is single-use, bound to the proposal ID and exact account, symbol, side, amount, strategy version, and input-data version, and expires after a short configured interval.
5. Immediately before placement, trusted code reruns account, position, buying-power, market-session, quote-freshness, exposure-cap, order-review, kill-switch, and duplicate-order checks. It places exactly the approved order only if every check still passes.
6. A changed order, expired approval, material quote movement beyond the configured tolerance, changed strategy input, warning, or ambiguous broker response fails closed and requires a new proposal and approval.
7. The system reconciles broker status and fills, journals the result, and sends a completion or failure notification.

Approval through free-form chat, an LLM judgment, or notification delivery alone is not authorization. There is no unattended live mode. The $100 gross-exposure cap, dedicated-account allowlist, long fractional ETF-only constraint, prohibited products, external kill switch, and one-order-per-unique-signal rule from ADR 0004 continue to apply.

The notification transport remains an adapter decision. Before selection it must support authenticated approve/reject actions or a secure deep link, delivery and action audit records, expiry, redaction of unnecessary account data, and a tested failure path. SMS reply text by itself is insufficient authorization.

## Alternatives considered

- **Keep `SPY` only:** simplest, but it prevents testing distinct transparent ETF hypotheses the owner explicitly wants to evaluate.
- **Allow any liquid or "major" ETF dynamically:** rejected because the boundary is subjective and could let an LLM or data error expand the product universe.
- **Approve the strategy once and run unattended:** rejected for the tiny-live learning phase because it removes the owner's per-trade learning and tuning loop.
- **Use a notification only, then execute automatically:** rejected because delivery is not consent and notifications can be delayed or missed.

## Consequences

- The strategy engine must evolve from one-symbol configuration to independently tested symbol/strategy pairs; inclusion on the broker allowlist does not itself justify a trade.
- Cross-ETF capital allocation and correlated exposure become deterministic domain problems. The combined gross exposure remains capped at $100, not $100 per ETF.
- A durable intent/approval journal and authenticated phone-facing approval surface are required before live placement.
- Execution may be missed when approval expires or arrives outside the valid market window; the system must not chase the trade without a fresh proposal.
- The owner receives a concise rationale before and an execution result after each attempt, creating evidence for later tuning without changing frozen strategy rules mid-test.

## Validation or reversal signal

Validate with fake/recorded broker and notification adapters proving rejection of unallowlisted symbols, replayed/expired approvals, altered orders, stale quotes, cap breaches, duplicate signals, notification failures, and ambiguous placement responses. The first real order remains capped at $10 and manually approved.

Revisit the allowlist when a fund's structure, liquidity, data quality, or strategy evidence changes. Any future request for unattended execution requires a new ADR and explicit owner approval.
