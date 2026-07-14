# ADR 0009: Morning core-plus-dip candidate

- **Status:** Accepted
- **Date:** 2026-07-13

## Context

ADR 0008 scheduled the frozen `SPY_CORE_PLUS_DIP_V1` observation after each Tuesday and Friday close. That produces a complete close, but it sends the owner a report after the useful pre-work window and separates strategy evaluation from the next morning's market context. Moving the same run to market open would silently change which close the rule observes and when an execution could honestly occur.

The owner wants one Tuesday/Friday report before starting work around 7:30 AM Pacific. It should use the latest fully completed NYSE session close for the deterministic signal and show the current session's opening context. A report generated after 6:30 AM cannot claim that a proposal was filled at the already elapsed opening print. The existing small SPY order remains a manually approved integration test, not candidate state or evidence for this version.

## Decision

Register `SPY_CORE_PLUS_DIP_MORNING_V1` as a separate, paper-only operational candidate. Keep `SPY_CORE_PLUS_DIP_V1` and every parameter frozen by ADR 0006 unchanged. This ADR supersedes ADR 0008's active Tuesday/Friday 3:30 PM schedule and its current-session close/date validation for that run. ADR 0008's read-only, redaction, notification, reconciliation, and approval boundaries remain in force, while the failure rules below replace only the incompatible post-close data-timing checks.

Run one combined report every Tuesday and Friday at 6:35 AM in the `America/Los_Angeles` timezone when the NYSE has a regular session. The report combines candidate evaluation with read-only reconciliation so the owner receives one morning result. A separate reconciliation check may run on Monday, Wednesday, or Thursday but emails only when an approved order is outstanding or changed; do not duplicate it on Tuesday or Friday.

The morning candidate copies ADR 0006's fixed `$100` pool, `$60` core, four one-use `$10` dip envelopes, 2%/5%/8%/12% thresholds, 20-session adjusted-close high, no-sale rule, costs, SPY scope, and buy-and-hold benchmark. Its timing is different:

- The Tuesday or Friday signal observation is the immediately prior completed NYSE session's corporate-action-adjusted close, not the current session's incomplete close. For example, an ordinary Tuesday uses Monday's adjusted close and an ordinary Friday uses Thursday's; a preceding closure uses the last earlier completed session. Preserve the raw SIP-settled close separately for date/provenance. Record Robinhood's raw `previous_close` and corporate-action-adjusted `adjusted_previous_close`, derive their positive adjustment factor, apply that factor to the official SIP price, and require the final adjusted-history bar to match the derived `adjustedPrice`. Revalidate both equations at the snapshot boundary instead of treating a raw and adjusted price as interchangeable.
- Build the adjusted series from non-interpolated Robinhood regular-session `4hour` bars requested with `adjustment_type=all`, grouped by market-session date and reduced to the last regular bar. This uses an interval for which the connected tool documents split-and-dividend adjustment; implicit or daily-all provenance is rejected.
- The report includes Robinhood's non-interpolated regular-session one-minute bar beginning at exactly 6:30 AM Pacific as clearly timestamped context for the gap from the adjusted signal close. A generic current quote cannot substitute for that opening reference. The opening value is not the signal, a broker review, an assumed fill, or evidence that the strategy traded at the open.
- No shadow or live execution may be backdated to the 6:30 AM opening print. A simulated execution record must use a separately defined observable timestamp at or after report generation. A live order still requires the exact symbol, side, dollar amount, order type, session, duration, current quote disclosure, broker review, and authenticated single-use owner approval required by ADR 0005.

Before emitting a proposal, validate through read-only market tools that the date is a scheduled NYSE session, the regular market has opened, the prior official close is final and from a recognized source, the 20-session adjusted-close series is complete and non-interpolated, SPY is active/tradable/fractional, and the opening reference is the positive-volume, non-interpolated `reg` bar for SPY beginning at exactly 6:30 AM Pacific. Account discovery may enumerate metadata only to resolve exactly one active, agent-accessible account; all downstream portfolio, position, and order-detail reads are restricted to that dedicated Agentic account, and identifiers remain masked.

For SPY, require exactly one tradability result, an active and tradeable instrument, regular-hours fractional eligibility, a tradable entry matching the selected account's brokerage account type, and no active or unresolved regular-hours halt. Missing, duplicate, conflicting, or unknown tradability values block the proposal. The project-scoped MCP allowlist must also make every Robinhood review, placement, cancellation, funding, transfer, and mutation tool unavailable to the scheduled task.

Fail closed with a report and no proposal when the host starts late enough that the opening context is no longer trustworthy; the market/session, prior-close, adjusted-history, quote, tradability, account, or order-state response is stale, missing, interpolated, inconsistent, ambiguous, paginated incompletely, or unavailable; the scheduled day is a full-day closure; or the candidate implementation/version does not exactly match this decision. A missing opening reference blocks the actionable proposal even though it is not a signal input, because the owner would lack current context for review. Notification failure leaves the Codex task result as the fallback; neither channel is an approval surface.

The local Codex schedule remains best-effort. A sleeping or offline host, expired authentication, connector degradation, or an unavailable Codex runtime can miss the 6:35 run. Do not silently shift, backfill, or count a late/duplicate run toward the operational gate. A hosted, market-calendar-aware scheduler remains a later decision.

## Alternatives considered

- **Keep the 3:30 PM report:** preserves ADR 0006's observation day exactly, but misses the owner's preferred morning review window.
- **Run at exactly 6:30 AM:** rejected because the market-open print and connector state may not yet be observable. The five-minute offset is a small settling window, not a fill guarantee.
- **Use the Tuesday/Friday opening price as the signal:** rejected because it changes the dip rule, relies on a noisier intraday observation, and would require a different hypothesis.
- **Pretend a 6:35 proposal executed at 6:30:** rejected as look-ahead in the operational workflow.
- **Keep separate Tuesday/Friday evaluation and reconciliation messages:** rejected because one combined morning report is easier to review and reduces duplicate connector reads and notifications.

## Consequences

- The owner can receive the twice-weekly status before work while every signal input is from a completed session.
- The morning candidate is directly distinguishable from ADR 0006's frozen close-evaluation candidate; results from the two versions cannot be pooled or compared as if their execution timing were identical.
- The opening reference makes overnight gaps visible but cannot improve a simulated fill retrospectively.
- A proposal generated at 6:35 may be less attractive by the time the owner approves it. Current-quote review and the stale-price guard therefore remain mandatory.
- Local scheduling has no delivery or uptime guarantee, so missing reports are failed observations rather than no-action signals.

## Validation or reversal signal

Before counting a morning run, verify the configured Tuesday/Friday 6:35 AM `America/Los_Angeles` cadence, candidate version, prior-session selection across ordinary weeks and holidays, market-open and quote timestamps, one combined reconciliation/report, stable deduplication, and a denial path for every broker write tool. Test normal, gap-up, gap-down, delayed-open, full-day closure, stale/interpolated/incomplete data, late host wake, connector timeout, queued/partial/final order states, duplicate run, and notification failure.

Revisit the five-minute settling window if observed connector latency makes opening context unreliable. Revisit the local scheduler if missed runs prevent the 60-check gate. Any change to thresholds, capital allocation, lookback, sale/replenishment rules, symbol, signal price, assumed execution timestamp, or unattended order authority requires another candidate or adapter decision.
