import type { Bar, MacdPoint } from "../types";

function emaSeries(values: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const out: (number | null)[] = Array(values.length).fill(null);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let ema = sum / period;
  out[period - 1] = ema;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

/** 标准 MACD(12, 26, 9)，前段不足处为 null */
export function computeMacd(bars: Bar[], fast = 12, slow = 26, signal = 9): MacdPoint[] {
  const closes = bars.map((b) => b.close);
  const emaFast = emaSeries(closes, fast);
  const emaSlow = emaSeries(closes, slow);
  const dif: (number | null)[] = bars.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? (emaFast[i] as number) - (emaSlow[i] as number) : null
  );
  const difNums: number[] = [];
  const difIndex: number[] = [];
  dif.forEach((v, i) => {
    if (v != null) {
      difNums.push(v);
      difIndex.push(i);
    }
  });
  const deaOnDif = emaSeries(difNums, signal);
  const dea: (number | null)[] = Array(bars.length).fill(null);
  deaOnDif.forEach((v, j) => {
    if (v != null) dea[difIndex[j]] = v;
  });
  return bars.map((b, i) => {
    const d = dif[i];
    const e = dea[i];
    return {
      time: b.time,
      dif: d,
      dea: e,
      hist: d != null && e != null ? d - e : null,
    };
  });
}
