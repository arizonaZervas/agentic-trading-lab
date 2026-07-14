import {
  assertPriceBars,
  parseStrategyConfig,
  type PriceBar,
  type StrategyConfig,
} from "./model.ts";
import { evaluateLatestSignal } from "./strategy.ts";

export interface SignalProposal {
  readonly status: "READY_FOR_HUMAN_REVIEW";
  readonly symbol: string;
  readonly signalDate: string;
  readonly dataField: "adjusted_close";
  readonly adjustedClose: number;
  readonly movingAverageMonths: number;
  readonly movingAverage: number;
  readonly targetAllocationPct: 0 | 100;
  readonly rationale: string;
  readonly safety: {
    readonly paperOnly: true;
    readonly placesBrokerOrders: false;
    readonly humanApprovalRequired: true;
  };
}

export function createSignalProposal(
  bars: readonly PriceBar[],
  config: StrategyConfig,
  confirmedMonthEndDate: string,
): SignalProposal {
  config = parseStrategyConfig(config);
  assertPriceBars(bars, config.symbol);
  const signal = evaluateLatestSignal(
    bars,
    config.movingAverageMonths,
    confirmedMonthEndDate,
  );
  const targetAllocationPct = signal.targetAllocation === 1 ? 100 : 0;
  const comparison = signal.targetAllocation === 1 ? "above" : "not above";

  return {
    status: "READY_FOR_HUMAN_REVIEW",
    symbol: config.symbol,
    signalDate: signal.signalDate,
    dataField: "adjusted_close",
    adjustedClose: signal.adjustedClose,
    movingAverageMonths: config.movingAverageMonths,
    movingAverage: signal.movingAverage,
    targetAllocationPct,
    rationale: `${config.symbol} adjusted close is ${comparison} its ${config.movingAverageMonths}-month moving average.`,
    safety: {
      paperOnly: true,
      placesBrokerOrders: false,
      humanApprovalRequired: true,
    },
  };
}
