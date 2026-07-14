# ADR 0008: Local shadow-report automation

- **Status:** Partially superseded by ADR 0009
- **Date:** 2026-07-13

## Context

The frozen core-plus-dip candidate needs repeated Tuesday/Friday observations before it can satisfy the operational evidence gate in the product brief. Running the command manually would make missed checks likely and would not exercise notification failures. A hosted scheduler, database, and authenticated approval application would add cost and operational surface before the shadow workflow has justified them.

Broker and email services are available to Codex as connected tools, but the broker connection can expose data from accounts outside the dedicated agent account. A scheduled prompt must therefore be treated as a privacy- and trading-sensitive adapter even when it is not permitted to place an order. Email delivery also cannot serve as authenticated consent for a live trade.

One manually reviewed and explicitly approved small SPY order was submitted through the broker as an integration smoke test. That order is not a `SPY_CORE_PLUS_DIP_V1` signal, does not represent its configured core purchase, and must not consume or otherwise alter the candidate's simulated tier state.

## Decision

Use two local Codex automations with separate responsibilities:

- Run the deterministic strategy evaluation every Tuesday and Friday at 3:30 PM in the `America/Los_Angeles` timezone, after the normal US market close. If either weekday is a market holiday, skip that observation rather than shifting it to another day.
- Run a read-only reconciliation on US weekdays at 6:30 AM Pacific local time, the regular-market open. It observes already approved or queued orders and emails only when an order is outstanding, newly seen, or changes state. It never calculates a same-day Tuesday/Friday signal because that session's close does not exist at market open.

The close-evaluation run may:

- execute the repository's deterministic, paper-only report path;
- use Robinhood read operations to inspect the dedicated Agentic account, positions, balances, and order status needed for reconciliation;
- mask account identifiers and minimize financial data in task output and email; and
- send the owner a redacted email report containing the run outcome, evidence, any shadow proposal, or an explicit no-action or blocked reason.

The automation must never call broker order-review, order-placement, order-cancellation, funding, transfer, watchlist-mutation, or other write operations. A shadow proposal is information only: it is not an order intent, authenticated approval request, or permission to trade. An email reply, email delivery, or absence of an objection is not approval under [ADR 0005](0005-human-approved-etf-order-workflow.md).

Enforce that boundary with the repository-scoped Robinhood MCP allowlist in `.codex/config.toml`, not only prompt text. It exposes exactly the account, portfolio, position, equity-order, equity-quote, equity-history, and equity-tradability read tools to every fresh project task. Each scheduled prompt also checks that no unexpected Robinhood capability is visible before accessing account data. This intentionally means an interim manually approved broker write must run outside this project until the authenticated approval adapter exists.

The market-open reconciliation may enumerate account metadata only to resolve exactly one active, agent-accessible account. It may then read portfolio, position, and recent equity-order details only for that dedicated Agentic account. It must not calculate or mutate strategy state, and it must not claim a fill unless Robinhood reports a final filled state and nonzero cumulative quantity. It stores only masked, ignored local receipts and sends no redundant email when no order is outstanding or changed.

For the legacy post-close run selected by this ADR, fail closed when the expected current-session close is missing, more than 60 minutes old, interpolated, incomplete, or not final, or when it is not from a recognized SIP close source or does not match the current `America/Los_Angeles` date. ADR 0009 supersedes those current-session close/date rules for the active morning candidate with immediately-prior-session validation. Both variants fail closed when any expected session is absent from the bounded 2026-2028 NYSE calendar; when the intended account is ambiguous; when read-only reconciliation fails; or when connector responses are incomplete or time out. Published full-day closures are skipped rather than shifted; dates beyond the checked-in calendar fail closed until it is updated. A failed data or broker check produces no strategy proposal. When email delivery is available, the report should describe the failure; the Codex task output remains the local fallback when email delivery fails.

The automation is a convenience scheduler, not a reliable hosted service. It can miss a run when the local host is asleep or offline, Codex is unavailable, authentication expires, or a connected service is degraded. It does not retry a missed holiday or silently shift a run. Missed and duplicate runs remain operational evidence failures and cannot count toward the activation gate.

## Alternatives considered

- **Continue with manual runs:** simplest, but it does not reliably exercise cadence, notification, and missed-run behavior.
- **Deploy a managed scheduled worker now:** potentially more reliable, but it introduces hosting, secrets, monitoring, and recovery obligations before the shadow workflow proves useful.
- **Let the automation review or place an order after emailing:** rejected because delivery is not authenticated intent-bound approval and would violate ADR 0005.
- **Use email replies as approve/reject actions:** rejected because ordinary email does not provide the required single-use binding, expiry, and replay protection.

## Consequences

- The laboratory can collect close-evaluation evidence twice weekly and independently reconcile queued orders at market open without introducing an in-repository live broker path.
- The owner receives a readable run record, including why no proposal was produced, while the deterministic report remains the source of strategy facts.
- Robinhood read access and emailed financial context require redaction and data minimization even though scheduled writes are denied.
- The workflow has no uptime or delivery guarantee. The owner must treat missing reports as missed checks, not as evidence that no action was needed.
- Any future authenticated approval surface, broker write capability, retry policy, hosted scheduler, or automatic execution is a separate adapter decision and must preserve ADR 0005's exact-order approval boundary.

## Validation or reversal signal

Validate the adapters by reading back both configured cadences, exercising successful, no-action, holiday, stale/future/unrecognized-source/interpolated/incomplete-session data, queued/partial/filled/rejected reconciliation, connector-timeout, duplicate-run, and notification-failure cases, and proving that broker review/place/cancel tools are unavailable to either scheduled workflow. Only valid, reproducible close-evaluation runs count toward the 60-check, 12-week shadow gate.

Revisit a managed scheduler if local availability produces missed checks or if the workflow advances beyond a single-owner research experiment. Revisit notification and approval together only when an authenticated, single-use, intent-bound phone action can be implemented and negatively tested.
