# Trading-agent discovery research

**Date:** 2026-07-12
**Decision:** Build a paper-only deterministic strategy laboratory. Do not connect a live broker order tool yet.

This is product and engineering research, not investment advice or a promise of returns.

## Bottom line

No credible source in the sampled research supports earning $100-$200 every month from $100 of capital. That target requires a 100%-200% monthly return. Reinvesting a 100% monthly return for a year would multiply the account by 4,096; reinvesting a 200% monthly return would multiply it by 531,441. Those are useful scam and overfitting detectors, not planning assumptions.

## Updated performance objective

The owner corrected the initial target: the strategy does not need to produce a fixed monthly dollar amount; it needs to beat the S&P 500. We operationalize that as positive after-cost excess total return versus an investable SPY buy-and-hold total-return benchmark over identical dates. A historical 8%-12% planning range is not a guaranteed or fixed annual hurdle.

The primary research gate is positive excess total return on a sealed out-of-sample period. Supporting evidence requires positive excess in a majority of predefined walk-forward windows. A provisional risk guardrail rejects a strategy whose maximum drawdown is more than five percentage points worse than the benchmark. Taxes remain outside the prototype and must be assessed before live use.

The substantive setups converged on a less glamorous pattern:

1. deterministic rules, not free-form LLM decisions;
2. a clean separation between data, signal, sizing, risk, execution, and audit;
3. costs and fill assumptions included from the start;
4. sealed out-of-sample or walk-forward evaluation;
5. paper/shadow operation followed by tiny live execution tests; and
6. hard shutdown limits that exist outside the model.

LLMs appear more defensible as research, explanation, monitoring, and incident-analysis tools. They are a poor trusted boundary for position sizing or unreviewed order placement.

## How sources were graded

- **Strong:** official documentation or research that states rules, assumptions, limitations, and failure modes.
- **Useful engineering evidence:** public code and a concrete architecture or test protocol, but no audited live performance.
- **Anecdote:** a disclosed setup or result with missing costs, code, capital normalization, or a short observation period.
- **Hypothesis/lead:** a claim or negative result worth independently testing, but without enough code or audit evidence to rely on.
- **Rejected:** profit screenshots, payout claims, affiliate funnels, or backtests with no reproducible rules and caveats.

No social post was treated as proof of a profitable edge.

## Platform findings

### X

The fallback logged-in search worked after the primary CLI could not authenticate. Most high-engagement results were exactly the influencer pattern we wanted to exclude: enormous profit headlines, video funnels, unspecified capital, and no auditable net returns.

- [A concrete overfitting failure](https://x.com/i/status/2076168927164711241) described an LLM selecting the best of 500 backtests, reporting 1,460%, and immediately opening three losing leveraged positions. It is useful negative evidence, not an audited experiment.
- [A more technical warning](https://x.com/i/status/2075805820781306074) argues that executable LLM-generated backtests can still encode the wrong experiment, hidden strategy search, or memorized price paths.

Conclusion: X was valuable for finding failure hypotheses, not credible return evidence.

### Reddit

- [Robinhood MCP leveraged-ETF anecdote](https://redd.it/1uoccyt): roughly $35 on $1,000 over about a month using one TQQQ/SQQQ breakout trade per day. No complete rules or code, a tiny sample, and leveraged-ETF risk. **Anecdote.**
- [Fees erase the apparent edge](https://redd.it/1tdeu7b): a $1,000 paper bot gained about $25 in four weeks and 480 trades, while the author acknowledged optimistic fills and roughly $20-$25 of omitted crypto fees. **Anecdote with a useful negative takeaway.**
- [Reproducible buy-the-dip rules](https://redd.it/1f0689m): rules, code, and a long backtest were provided; comments identified close-auction execution, magic-number filtering, omitted costs/dividends, and weak recent performance. **Useful engineering evidence, not deployment proof.**
- [Practitioner validation checklist](https://redd.it/njcquf): separate strategy and execution, model fills and costs, cover multiple market cycles, expect live drawdowns to exceed backtests, and define shutdown rules. **Hypothesis/lead for our validation plan.**
- [Candid ML failure](https://redd.it/1um3mn2): a large 20-year/13,000-ticker experiment fell from roughly 70% in-sample to 50.5% out-of-sample despite more sophisticated validation. **Hypothesis/lead, not independently audited.**
- [OANDA EMA/ATR bot](https://redd.it/1ksqq04): concrete API/data/order/stop code, but no profitability or backtest disclosure. **Useful engineering evidence only.**

The Reddit search covered five queries, 66 ranked results with duplicates, and three full comment threads. It was not exhaustive.

### LinkedIn

- [TrendBot](https://www.linkedin.com/posts/adithgunaseelan_algorithmictrading-python-quantfinance-activity-7435552863268925441-TOAi) and its [source code](https://github.com/AdithNG/trendbot) disclose EMA/RSI/volume rules, ATR risk controls, a daily-loss halt, and a sealed out-of-sample split. It supports paper and live Alpaca endpoints, recommends paper first, and publishes no return proof. **Useful architecture evidence, not safety or return evidence.**
- [Cross-momentum bot](https://www.linkedin.com/posts/harshal-gupta-a2464021a_github-harshalgupta3011cross-momentum-trading-bot-activity-7435533832944173079-pMFQ) and its [source code](https://github.com/HarshalGupta3011/Cross-Momentum-Trading-Bot) disclose 12-month ranking, monthly top-30 selection, an EMA200 cash filter, a kill switch, and modeled brokerage/STT/impact costs. The cost assumptions and claimed CAGR were not independently validated, and no live proof was found. **Useful engineering evidence with an unverified return claim.**
- [A negative strategy-selection result](https://www.linkedin.com/posts/rajdeep-chauhan-168512242_quant-algotrading-python-activity-7468755824895643650-GB-L) reports walk-forward, Monte Carlo, and deflated-Sharpe rejection of faster trend, mean-reversion, and opening-range systems; only a slow trend survived. **Hypothesis/lead, no code.**
- [An LLM-agent audit](https://www.linkedin.com/posts/milosmaricic_llm-trading-agents-lose-out-to-simply-doing-activity-7470033425534545920-rWRl) reports that clean out-of-sample evaluation and full frictions reduced agents below buy-and-hold. **Hypothesis/lead, not independently audited here.**

The dedicated LinkedIn backend was unavailable, so this used publicly indexed pages and is partial coverage.

### Instagram and Facebook

Instagram exposed accounts with profit and payout claims but no complete rules, code, capital-normalized net returns, or accessible audit. Facebook searches returned no relevant substantive results. Both channels were rejected as evidence rather than padded into the source list.

## Primary and general-web evidence

### Robinhood's actual agent boundary

Robinhood's [Agentic Trading overview](https://robinhood.com/us/en/support/articles/agentic-trading-overview/) confirms that the Trading MCP is real but still rolling out. The agent can read account identifiers, positions, balances, and transaction history across Robinhood accounts, while order placement is confined to a dedicated Agentic account. That is still a broad privacy boundary.

Robinhood's [current tool list](https://robinhood.com/us/en/support/articles/trading-with-your-agent/) includes market data, scans, order review, placement, and cancellation for long equities and options. An agent can trade without per-order confirmation if instructed to do so, and Robinhood assigns responsibility for those trades to the user. `review_equity_order` is a pre-trade simulation/warning tool, not a historical paper-trading account.

FINRA [replaced the former pattern-day-trader framework](https://www.finra.org/rules-guidance/notices/26-10) effective June 4, 2026, but firms may phase in the new intraday-margin rules through October 20, 2027. Broker-specific behavior must therefore be checked at execution time. This project avoids depending on either framework by excluding intraday activity and margin.

### A simple published rule worth using as a test fixture

Meb Faber's published [tactical allocation paper](https://mebfaber.com/wp-content/uploads/2016/05/SSRN-id962461.pdf) provides a deliberately simple rule: at month end, hold the asset when its monthly total-return price is above its 10-month simple moving average; otherwise hold cash. The paper also makes the important caveats visible: its headline model executes at the signal close, excludes costs in the main presentation, credits cash with 90-day Treasury-bill returns, and can underperform buy-and-hold for long periods.

We are using that rule as a transparent engineering fixture, not claiming it will produce alpha. The prototype is more conservative about look-ahead by executing on the next observed trading day and charging configurable slippage and fixed fees. It is more conservative than the paper while in cash because it currently credits zero cash return.

### Backtests and paper trading are necessary but insufficient

Bailey, Borwein, López de Prado, and Zhu's [Probability of Backtest Overfitting](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2326253) explains why repeated strategy selection can make even ordinary holdout testing unreliable.

Alpaca's [paper-trading documentation](https://docs.alpaca.markets/docs/paper-trading) explicitly says its simulator omits market impact, information leakage, latency slippage, queue position, price improvement, regulatory fees, and dividends. A successful paper result is an integration test, not proof of live returns.

The SEC/FINRA/NASAA [AI investment-fraud alert](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-alerts/artificial-intelligence-fraud) treats amazing or guaranteed AI returns as a red flag.

## Product decision

The first build is a local TypeScript strategy laboratory with two outputs:

- a cost-aware historical backtest against buy-and-hold; and
- a month-end target-allocation proposal that cannot place an order.

The original slow-trend rule and boundaries are:

- one symbol (`SPY`) and fractional long exposure or cash;
- 10-month moving-average signal using adjusted closes, with raw closes retained as execution references;
- explicit `is_month_end` and `is_first_session_of_month` markers supplied by the data preparation boundary;
- evaluate only at confirmed month end;
- simulate execution on the next trading day;
- configurable per-side slippage;
- $100 research-cap validation;
- no options, leverage, shorting, crypto, intraday trading, news sentiment, or LLM-generated orders; and
- no Robinhood credentials or MCP connection in the prototype.

This does not target a monthly dollar profit. It tests whether the data, signal, risk, and audit path are correct and whether a frozen rule produces positive after-cost excess return versus same-period SPY buy-and-hold. The slow-trend rule remains a baseline candidate, not the presumed winner.

On 2026-07-13 the owner registered a second candidate, `SPY_CORE_PLUS_DIP_V1`, without replacing the baseline. It invests $60 as a core, reserves four $10 envelopes for first crossings of 2%, 5%, 8%, and 12% drawdowns from the rolling 20-session adjusted-close high, evaluates Tuesday and Friday, and simulates at the next observed open. It never sells or replenishes cash. [ADR 0006](../decisions/0006-core-plus-dip-research-candidate.md) freezes the full experiment and keeps ordinary SPY buy-and-hold as the benchmark. Synthetic tests prove the comparison can favor either side; they are engineering evidence, not performance evidence.

## Gate before any live-money adapter

Live order placement requires a separate decision and implementation. At minimum:

1. use a licensed/reliable adjusted total-return data source and document corporate-action handling;
2. freeze the rule before the final evaluation period;
3. test multiple market regimes and cost levels, then require positive excess total return on the sealed out-of-sample period and in a majority of predefined walk-forward windows against SPY buy-and-hold;
4. run at least 60 consecutive scheduled shadow checks spanning at least 12 weeks and three confirmed month ends with zero stale-data, duplicate-signal, or audit failures;
5. reconcile every simulated proposal with an independently calculated expected result;
6. implement idempotency, broker-side order review, a hard account cap, stale-price rejection, and a kill switch outside the LLM; and
7. follow the activation sequence in [ADR 0004](../decisions/0004-bounded-tiny-live-trading.md) as superseded by [ADR 0005](../decisions/0005-human-approved-etf-order-workflow.md). The initial live allowlist is `SPY`, `QQQ`, `SMH`, and `SCHD`; every live order requires a phone notification and an authenticated, single-use owner approval. The first live order remains capped at $10, and unattended mode is not authorized.

## Research limitations

- Social search is a sample affected by ranking, login state, deletions, private groups, and platform search quality.
- No claimed social-media performance was independently audited.
- Neither candidate has completed a pre-registered walk-forward, sealed out-of-sample, or paper-operation evaluation.
- Consecutive calendar months and marker sequencing are checked, but the truth of the session markers still depends on an external market-calendar/data-quality adapter.
- The prototype models total-return changes but not share quantities or corporate actions, and credits no return while in cash.
- A computation smoke test used [FRED's S&P 500 price index](https://fred.stlouisfed.org/series/SP500), which explicitly excludes dividends; it proves the CLI runs on real rows but is not valid performance evidence for the total-return strategy.
