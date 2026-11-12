import type { Bar, MarketBundle } from "../types";
import { isoWeekKey, shanghaiParts, tradingMinuteOf } from "./time";
import { MINUTES_PER_DAY } from "./period";

function mergeBars(group: Bar[]): Bar {
  return {
    time: group[group.length - 1].time,
    open: group[0].open,
    high: Math.max(...group.map((b) => b.high)),
    low: Math.min(...group.map((b) => b.low)),
    close: group[group.length - 1].close,
  };
}

function bucketKey(bar: Bar, periodMinutes: number): string {
  const p = shanghaiParts(bar.time);
  const tmin = tradingMinuteOf(bar.time);
  const week = isoWeekKey(p);
  const weekday = Math.min(p.weekday, 4);

  if (periodMinutes >= MINUTES_PER_DAY) {
    const daysPer = periodMinutes / MINUTES_PER_DAY;
    if (Math.abs(daysPer - Math.round(daysPer)) < 1e-9) {
      const d = Math.round(daysPer);
      return `${week}-D${Math.floor(weekday / d)}`;
    }
    const global = weekday * MINUTES_PER_DAY + tmin;
    return `${week}-M${Math.floor(global / periodMinutes)}`;
  }

  if (periodMinutes > 120) {
    return `${p.dateKey}-${Math.floor(tmin / periodMinutes)}`;
  }

  const sess = tmin < 120 ? 0 : 1;
  const sm = tmin < 120 ? tmin : tmin - 120;
  return `${p.dateKey}-${sess}-${Math.floor(sm / periodMinutes)}`;
}

export function aggregateBars(bars: Bar[], basePeriod: number, targetPeriod: number): Bar[] {
  if (!bars.length) return [];
  if (targetPeriod <= basePeriod) return bars.slice();
  const groups = new Map<string, Bar[]>();
  const order: string[] = [];
  for (const bar of bars) {
    const key = bucketKey(bar, targetPeriod);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(bar);
  }
  return order.map((k) => mergeBars(groups.get(k)!));
}

export type BaseChoice = {
  bars: Bar[];
  basePeriod: number;
  source: string;
};

/**
 * 选择能整除目标周期的最细数据。
 * 短周期必须从 1 分钟重聚合；当目标周期是 5/60/240 的倍数时，
 * 改用更长历史的 5 分钟 / 60 分钟 / 日线，以便滑块拉到 1 周仍有足够K线。
 */
export function chooseBase(periodMinutes: number, bundle: MarketBundle["data"]): BaseChoice {
  const p = periodMinutes;
  const has = (k: keyof MarketBundle["data"]) => (bundle[k]?.bars?.length || 0) > 0;

  if (p % MINUTES_PER_DAY === 0 && has("1d")) {
    return { bars: bundle["1d"]!.bars, basePeriod: MINUTES_PER_DAY, source: bundle["1d"]!.source };
  }
  if (p % 60 === 0 && p >= 60 && has("60m")) {
    return { bars: bundle["60m"]!.bars, basePeriod: 60, source: bundle["60m"]!.source };
  }
  if (p % 5 === 0 && p >= 5 && has("5m")) {
    return { bars: bundle["5m"]!.bars, basePeriod: 5, source: bundle["5m"]!.source };
  }
  if (has("1m")) {
    return { bars: bundle["1m"]!.bars, basePeriod: 1, source: bundle["1m"]!.source };
  }
  // 1 分钟缺失时的降级：用不超过目标周期的最细数据
  if (has("5m") && p >= 5) {
    return { bars: bundle["5m"]!.bars, basePeriod: 5, source: bundle["5m"]!.source };
  }
  if (has("60m") && p >= 60) {
    return { bars: bundle["60m"]!.bars, basePeriod: 60, source: bundle["60m"]!.source };
  }
  if (has("1d")) {
    return { bars: bundle["1d"]!.bars, basePeriod: MINUTES_PER_DAY, source: bundle["1d"]!.source };
  }
  return { bars: [], basePeriod: 1, source: "none" };
}

export function buildChartBars(periodMinutes: number, bundle: MarketBundle["data"]) {
  const base = chooseBase(periodMinutes, bundle);
  const bars = aggregateBars(base.bars, base.basePeriod, periodMinutes);
  return { ...base, bars };
}
