import type { Annotation, Bar } from "../types";

export type Layout = {
  width: number;
  height: number;
  k: { x: number; y: number; w: number; h: number };
  macd: { x: number; y: number; w: number; h: number };
  axisY: { x: number; w: number };
  timeAxis: { y: number; h: number };
  padLeft: number;
};

export type ViewState = {
  offset: number;
  barWidth: number;
};

export const AXIS_Y_W = 58;
export const TIME_AXIS_H = 22;
export const MIN_BAR_WIDTH = 1.5;
export const DENSITY_MIN = 20;
export const DENSITY_MAX = 500;
export const DEFAULT_VISIBLE_BARS = 80;
export const HANDLE_R = 7;

/** 根据绘图区宽度计算一屏可显示的 K 线根数范围 */
export function densityLimits(plotWidth: number): { min: number; max: number } {
  const w = Math.max(40, plotWidth);
  const min = DENSITY_MIN;
  const max = Math.max(min, Math.min(DENSITY_MAX, Math.floor(w / MIN_BAR_WIDTH)));
  return { min, max };
}

export function clampVisibleBars(visibleBars: number, plotWidth: number): number {
  const { min, max } = densityLimits(plotWidth);
  const n = Math.round(Number(visibleBars));
  if (!Number.isFinite(n)) return Math.min(DEFAULT_VISIBLE_BARS, max);
  return Math.max(min, Math.min(max, n));
}

export function visibleBarsOf(view: ViewState, layout: Layout): number {
  if (view.barWidth <= 0) return densityLimits(layout.k.w).min;
  return layout.k.w / view.barWidth;
}

/** 按目标根数设置 barWidth；可选保留上一视窗中心，若原本贴在最新一根则仍贴右端 */
export function viewFromDensity(
  layout: Layout,
  visibleBars: number,
  barCount: number,
  prev?: ViewState
): ViewState {
  const vis = clampVisibleBars(visibleBars, layout.k.w);
  const barWidth = layout.k.w / vis;
  let offset: number;
  if (prev && prev.barWidth > 0) {
    const oldVis = layout.k.w / prev.barWidth;
    const right = prev.offset + oldVis;
    const atEnd = right >= barCount - 0.6;
    if (atEnd) offset = barCount - vis;
    else offset = prev.offset + oldVis / 2 - vis / 2;
  } else {
    offset = barCount - vis;
  }
  return clampView({ offset, barWidth }, layout, barCount);
}

export function computeLayout(width: number, height: number, isMobile: boolean): Layout {
  const padLeft = 8;
  const axisW = AXIS_Y_W;
  const timeH = TIME_AXIS_H;
  const macdH = Math.max(isMobile ? 88 : 110, Math.min(160, Math.floor(height * 0.22)));
  const kH = Math.max(80, height - macdH - timeH);
  return {
    width,
    height,
    k: { x: padLeft, y: 0, w: Math.max(10, width - padLeft - axisW), h: kH },
    timeAxis: { y: kH, h: timeH },
    macd: { x: padLeft, y: kH + timeH, w: Math.max(10, width - padLeft - axisW), h: macdH },
    axisY: { x: width - axisW, w: axisW },
    padLeft,
  };
}

export function defaultView(barCount: number, layout: Layout, visibleBars = DEFAULT_VISIBLE_BARS): ViewState {
  return viewFromDensity(layout, visibleBars, barCount);
}

export function indexToX(index: number, view: ViewState, layout: Layout): number {
  return layout.k.x + (index - view.offset) * view.barWidth;
}

export function xToIndex(x: number, view: ViewState, layout: Layout): number {
  return view.offset + (x - layout.k.x) / view.barWidth;
}

export function timeToIndex(time: number, bars: Bar[]): number {
  if (!bars.length) return 0;
  if (time <= bars[0].time) return 0;
  if (time >= bars[bars.length - 1].time) return bars.length - 1;
  let lo = 0;
  let hi = bars.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time === time) return mid;
    if (bars[mid].time < time) lo = mid + 1;
    else hi = mid - 1;
  }
  const i = Math.max(0, lo);
  const left = i - 1;
  if (left < 0) return 0;
  const t0 = bars[left].time;
  const t1 = bars[i].time;
  if (t1 === t0) return left;
  return left + (time - t0) / (t1 - t0);
}

export function indexToTime(index: number, bars: Bar[]): number {
  if (!bars.length) return 0;
  if (index <= 0) return bars[0].time;
  if (index >= bars.length - 1) return bars[bars.length - 1].time;
  const i0 = Math.floor(index);
  const i1 = Math.ceil(index);
  if (i0 === i1) return bars[i0].time;
  const f = index - i0;
  return bars[i0].time + (bars[i1].time - bars[i0].time) * f;
}

export function timeToX(time: number, bars: Bar[], view: ViewState, layout: Layout): number {
  return indexToX(timeToIndex(time, bars), view, layout);
}

export function xToTime(x: number, bars: Bar[], view: ViewState, layout: Layout): number {
  return indexToTime(xToIndex(x, view, layout), bars);
}

export type PriceScale = { min: number; max: number };

export function priceToY(price: number, scale: PriceScale, rect: { y: number; h: number }): number {
  const span = scale.max - scale.min || 1;
  return rect.y + ((scale.max - price) / span) * rect.h;
}

export function yToPrice(y: number, scale: PriceScale, rect: { y: number; h: number }): number {
  const span = scale.max - scale.min || 1;
  return scale.max - ((y - rect.y) / rect.h) * span;
}

export function visibleRange(view: ViewState, layout: Layout, barCount: number) {
  const start = Math.max(0, Math.floor(view.offset) - 1);
  const end = Math.min(barCount - 1, Math.ceil(view.offset + layout.k.w / view.barWidth) + 1);
  return { start, end };
}

export function autoPriceScale(bars: Bar[], start: number, end: number, pad = 0.08): PriceScale {
  let min = Infinity;
  let max = -Infinity;
  for (let i = start; i <= end; i++) {
    const b = bars[i];
    if (!b) continue;
    min = Math.min(min, b.low);
    max = Math.max(max, b.high);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const extra = (max - min) * pad;
  return { min: min - extra, max: max + extra };
}

export type Handle =
  | { kind: "line-end"; id: string; end: 1 | 2 }
  | { kind: "box-corner"; id: string; h: "left" | "right"; v: "top" | "bottom" }
  | { kind: "box-edge"; id: string; edge: "left" | "right" | "top" | "bottom" };

function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(px, py, x1, y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(px, py, x1 + t * dx, y1 + t * dy);
}

export function hitHandle(
  x: number,
  y: number,
  anns: Annotation[],
  bars: Bar[],
  view: ViewState,
  layout: Layout,
  scale: PriceScale,
  selectedId: string | null,
  threshold = 14
): Handle | null {
  const selected = anns.find((a) => a.id === selectedId);
  if (!selected) return null;
  const pts = endpoints(selected, bars, view, layout, scale);
  if (selected.type === "line") {
    if (dist(x, y, pts.x1, pts.y1) <= threshold) return { kind: "line-end", id: selected.id, end: 1 };
    if (dist(x, y, pts.x2, pts.y2) <= threshold) return { kind: "line-end", id: selected.id, end: 2 };
    return null;
  }
  const { left, right, top, bottom } = pts;
  const corners: { h: "left" | "right"; v: "top" | "bottom"; x: number; y: number }[] = [
    { h: "left", v: "top", x: left, y: top },
    { h: "right", v: "top", x: right, y: top },
    { h: "left", v: "bottom", x: left, y: bottom },
    { h: "right", v: "bottom", x: right, y: bottom },
  ];
  for (const c of corners) {
    if (dist(x, y, c.x, c.y) <= threshold) return { kind: "box-corner", id: selected.id, h: c.h, v: c.v };
  }
  const edgeHit = threshold * 0.85;
  if (Math.abs(x - left) <= edgeHit && y >= top - edgeHit && y <= bottom + edgeHit)
    return { kind: "box-edge", id: selected.id, edge: "left" };
  if (Math.abs(x - right) <= edgeHit && y >= top - edgeHit && y <= bottom + edgeHit)
    return { kind: "box-edge", id: selected.id, edge: "right" };
  if (Math.abs(y - top) <= edgeHit && x >= left - edgeHit && x <= right + edgeHit)
    return { kind: "box-edge", id: selected.id, edge: "top" };
  if (Math.abs(y - bottom) <= edgeHit && x >= left - edgeHit && x <= right + edgeHit)
    return { kind: "box-edge", id: selected.id, edge: "bottom" };
  return null;
}

export function hitAnnotation(
  x: number,
  y: number,
  anns: Annotation[],
  bars: Bar[],
  view: ViewState,
  layout: Layout,
  scale: PriceScale,
  threshold = 10
): string | null {
  for (let i = anns.length - 1; i >= 0; i--) {
    const a = anns[i];
    const pts = endpoints(a, bars, view, layout, scale);
    if (a.type === "line") {
      if (distToSeg(x, y, pts.x1, pts.y1, pts.x2, pts.y2) <= threshold) return a.id;
    } else {
      const pad = 6;
      if (x >= pts.left - pad && x <= pts.right + pad && y >= pts.top - pad && y <= pts.bottom + pad) {
        const inside =
          x >= pts.left + pad && x <= pts.right - pad && y >= pts.top + pad && y <= pts.bottom - pad;
        const onBorder =
          Math.abs(x - pts.left) <= pad ||
          Math.abs(x - pts.right) <= pad ||
          Math.abs(y - pts.top) <= pad ||
          Math.abs(y - pts.bottom) <= pad;
        if (onBorder || inside) return a.id;
      }
    }
  }
  return null;
}

export type Endpoints = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  midX: number;
  midY: number;
};

export function endpoints(
  a: Annotation,
  bars: Bar[],
  view: ViewState,
  layout: Layout,
  scale: PriceScale
): Endpoints {
  const x1 = timeToX(a.t1, bars, view, layout);
  const x2 = timeToX(a.t2, bars, view, layout);
  const y1 = priceToY(a.p1, scale, layout.k);
  const y2 = priceToY(a.p2, scale, layout.k);
  return {
    x1,
    y1,
    x2,
    y2,
    left: Math.min(x1, x2),
    right: Math.max(x1, x2),
    top: Math.min(y1, y2),
    bottom: Math.max(y1, y2),
    midX: (x1 + x2) / 2,
    midY: (y1 + y2) / 2,
  };
}

export type SnapResult = { time: number; price: number; snapped: boolean };

export function snapPoint(
  time: number,
  price: number,
  bars: Bar[],
  view: ViewState,
  layout: Layout,
  scale: PriceScale,
  pixelThreshold = 12
): SnapResult {
  if (!bars.length) return { time, price, snapped: false };
  const x = timeToX(time, bars, view, layout);
  const idx = xToIndex(x, view, layout);
  const from = Math.max(0, Math.floor(idx) - 2);
  const to = Math.min(bars.length - 1, Math.ceil(idx) + 2);
  let best: SnapResult | null = null;
  let bestDist = Infinity;
  for (let i = from; i <= to; i++) {
    const b = bars[i];
    const bx = indexToX(i, view, layout) + view.barWidth * 0.5;
    if (Math.abs(bx - x) > pixelThreshold * 2) continue;
    for (const pr of [b.high, b.low]) {
      const by = priceToY(pr, scale, layout.k);
      const py = priceToY(price, scale, layout.k);
      const d = Math.hypot(bx - x, by - py);
      if (d < bestDist && d <= pixelThreshold) {
        bestDist = d;
        best = { time: b.time, price: pr, snapped: true };
      }
    }
  }
  return best ?? { time, price, snapped: false };
}

export function clampView(view: ViewState, layout: Layout, barCount: number): ViewState {
  const { min, max } = densityLimits(layout.k.w);
  const minWidth = layout.k.w / max;
  const maxWidth = layout.k.w / min;
  const barWidth = Math.max(minWidth, Math.min(maxWidth, view.barWidth));
  const visible = layout.k.w / barWidth;
  const minOff = Math.min(-2, -visible * 0.15);
  const maxOff = Math.max(0, barCount - visible * 0.15);
  let offset = view.offset;
  if (offset < minOff) offset = minOff;
  if (offset > maxOff) offset = maxOff;
  return { offset, barWidth };
}

export function zoomAround(view: ViewState, layout: Layout, anchorX: number, factor: number, barCount: number): ViewState {
  const idx = xToIndex(anchorX, view, layout);
  const { min, max } = densityLimits(layout.k.w);
  const minWidth = layout.k.w / max;
  const maxWidth = layout.k.w / min;
  const barWidth = Math.max(minWidth, Math.min(maxWidth, view.barWidth * factor));
  const offset = idx - (anchorX - layout.k.x) / barWidth;
  return clampView({ offset, barWidth }, layout, barCount);
}
