import type { Annotation, Bar, MacdPoint } from "../types";
import {
  type Layout,
  type PriceScale,
  type ViewState,
  AXIS_Y_W,
  endpoints,
  indexToX,
  priceToY,
  visibleRange,
} from "./geometry";
import { formatAxisTime, formatPrice } from "./time";

const UP = "#ef5350";
const DOWN = "#26a69a";
const GRID = "rgba(230, 237, 243, 0.06)";
const TEXT = "#8b949e";
const CROSS = "rgba(230, 237, 243, 0.45)";
const DIF = "#f5d76e";
const DEA = "#c39bd3";

function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min || 1;
  const raw = span / Math.max(1, count);
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const err = raw / pow;
  let step = pow;
  if (err >= 7.5) step = 10 * pow;
  else if (err >= 3.5) step = 5 * pow;
  else if (err >= 1.5) step = 2 * pow;
  const ticks: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let v = start; v <= max + step * 0.01; v += step) ticks.push(v);
  return ticks;
}

export function renderChart(opts: {
  ctx: CanvasRenderingContext2D;
  layout: Layout;
  bars: Bar[];
  macd: MacdPoint[];
  view: ViewState;
  kScale: PriceScale;
  annotations: Annotation[];
  selectedId: string | null;
  crosshair: { x: number; y: number } | null;
  periodMinutes: number;
  dpr: number;
}) {
  const { ctx, layout, bars, macd, view, kScale, annotations, selectedId, crosshair, periodMinutes } = opts;
  const { width, height, k, macd: mrect } = layout;
  ctx.clearRect(0, 0, width, height);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();

  const { start, end } = visibleRange(view, layout, bars.length);

  // grid + y ticks
  const kTicks = niceTicks(kScale.min, kScale.max, 6);
  ctx.font = "11px -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  for (const t of kTicks) {
    const y = priceToY(t, kScale, k);
    if (y < k.y + 2 || y > k.y + k.h - 2) continue;
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(k.x, Math.round(y) + 0.5);
    ctx.lineTo(k.x + k.w, Math.round(y) + 0.5);
    ctx.stroke();
    ctx.fillStyle = TEXT;
    ctx.fillText(formatPrice(t), layout.axisY.x + 6, y);
  }

  // time ticks
  const stepBars = Math.max(1, Math.round(90 / view.barWidth));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const timeY = layout.timeAxis.y + layout.timeAxis.h / 2;
  let lastLabelX = -999;
  for (let i = start; i <= end; i++) {
    if (i < 0 || i >= bars.length) continue;
    if (i !== start && i !== bars.length - 1 && i % stepBars !== 0) continue;
    const x = indexToX(i, view, layout) + view.barWidth * 0.5;
    if (x < k.x || x > k.x + k.w) continue;
    if (x - lastLabelX < 64 && i !== bars.length - 1) continue;
    lastLabelX = x;
    ctx.strokeStyle = GRID;
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, k.y);
    ctx.lineTo(Math.round(x) + 0.5, k.y + k.h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, mrect.y);
    ctx.lineTo(Math.round(x) + 0.5, mrect.y + mrect.h);
    ctx.stroke();
    ctx.fillStyle = TEXT;
    ctx.fillText(formatAxisTime(bars[i].time, periodMinutes), x, timeY);
  }

  // candles
  for (let i = start; i <= end; i++) {
    const b = bars[i];
    if (!b) continue;
    const x = indexToX(i, view, layout);
    const cw = Math.max(1, view.barWidth * 0.7);
    const cx = x + view.barWidth / 2;
    const up = b.close >= b.open;
    const color = up ? UP : DOWN;
    const yO = priceToY(b.open, kScale, k);
    const yC = priceToY(b.close, kScale, k);
    const yH = priceToY(b.high, kScale, k);
    const yL = priceToY(b.low, kScale, k);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1, Math.min(2, view.barWidth * 0.12));
    ctx.beginPath();
    ctx.moveTo(cx, yH);
    ctx.lineTo(cx, yL);
    ctx.stroke();
    const top = Math.min(yO, yC);
    const h = Math.max(1, Math.abs(yC - yO));
    ctx.fillRect(cx - cw / 2, top, cw, h);
  }

  // annotations
  for (const a of annotations) {
    const selected = a.id === selectedId;
    const pts = endpoints(a, bars, view, layout, kScale);
    ctx.strokeStyle = a.color;
    ctx.lineWidth = selected ? 2.2 : 1.6;
    ctx.setLineDash([]);
    if (a.type === "line") {
      ctx.beginPath();
      ctx.moveTo(pts.x1, pts.y1);
      ctx.lineTo(pts.x2, pts.y2);
      ctx.stroke();
    } else {
      ctx.strokeRect(pts.left, pts.top, Math.max(1, pts.right - pts.left), Math.max(1, pts.bottom - pts.top));
      ctx.fillStyle = hexToRgba(a.color, selected ? 0.12 : 0.06);
      ctx.fillRect(pts.left, pts.top, Math.max(1, pts.right - pts.left), Math.max(1, pts.bottom - pts.top));
    }
    if (selected) {
      const handles: { x: number; y: number }[] =
        a.type === "line"
          ? [
              { x: pts.x1, y: pts.y1 },
              { x: pts.x2, y: pts.y2 },
            ]
          : [
              { x: pts.left, y: pts.top },
              { x: pts.right, y: pts.top },
              { x: pts.left, y: pts.bottom },
              { x: pts.right, y: pts.bottom },
              { x: pts.midX, y: pts.top },
              { x: pts.midX, y: pts.bottom },
              { x: pts.left, y: pts.midY },
              { x: pts.right, y: pts.midY },
            ];
      for (const h of handles) {
        ctx.beginPath();
        ctx.fillStyle = "#0d1117";
        ctx.strokeStyle = a.color;
        ctx.lineWidth = 2;
        ctx.arc(h.x, h.y, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  // MACD
  let histMin = 0;
  let histMax = 0;
  let lineMin = 0;
  let lineMax = 0;
  let hasMacd = false;
  for (let i = start; i <= end; i++) {
    const p = macd[i];
    if (!p) continue;
    if (p.hist != null) {
      histMin = Math.min(histMin, p.hist);
      histMax = Math.max(histMax, p.hist);
      hasMacd = true;
    }
    if (p.dif != null) {
      lineMin = Math.min(lineMin, p.dif);
      lineMax = Math.max(lineMax, p.dif);
      hasMacd = true;
    }
    if (p.dea != null) {
      lineMin = Math.min(lineMin, p.dea);
      lineMax = Math.max(lineMax, p.dea);
      hasMacd = true;
    }
  }
  const macdMin = Math.min(histMin, lineMin);
  const macdMax = Math.max(histMax, lineMax);
  const macdPad = (macdMax - macdMin || 1) * 0.12;
  const macdScale: PriceScale = {
    min: hasMacd ? macdMin - macdPad : -1,
    max: hasMacd ? macdMax + macdPad : 1,
  };
  const zeroY = priceToY(0, macdScale, mrect);
  ctx.strokeStyle = "rgba(139, 148, 158, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(mrect.x, Math.round(zeroY) + 0.5);
  ctx.lineTo(mrect.x + mrect.w, Math.round(zeroY) + 0.5);
  ctx.stroke();

  const mTicks = niceTicks(macdScale.min, macdScale.max, 3);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (const t of mTicks) {
    const y = priceToY(t, macdScale, mrect);
    if (y < mrect.y + 2 || y > mrect.y + mrect.h - 2) continue;
    ctx.fillStyle = TEXT;
    ctx.fillText(t.toFixed(2), layout.axisY.x + 6, y);
  }

  for (let i = start; i <= end; i++) {
    const p = macd[i];
    if (!p || p.hist == null) continue;
    const x = indexToX(i, view, layout);
    const cw = Math.max(1, view.barWidth * 0.6);
    const cx = x + view.barWidth / 2;
    const y = priceToY(p.hist, macdScale, mrect);
    ctx.fillStyle = p.hist >= 0 ? UP : DOWN;
    const top = Math.min(y, zeroY);
    const h = Math.max(1, Math.abs(y - zeroY));
    ctx.fillRect(cx - cw / 2, top, cw, h);
  }

  const drawLine = (key: "dif" | "dea", color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    let started = false;
    for (let i = start; i <= end; i++) {
      const p = macd[i];
      const val = p?.[key];
      if (val == null) {
        started = false;
        continue;
      }
      const x = indexToX(i, view, layout) + view.barWidth / 2;
      const y = priceToY(val, macdScale, mrect);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  drawLine("dif", DIF);
  drawLine("dea", DEA);

  ctx.fillStyle = TEXT;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("MACD (12, 26, 9)", mrect.x + 6, mrect.y + 4);
  ctx.fillStyle = DIF;
  ctx.fillText("DIF", mrect.x + 118, mrect.y + 4);
  ctx.fillStyle = DEA;
  ctx.fillText("DEA", mrect.x + 150, mrect.y + 4);

  // crosshair
  if (crosshair && bars.length) {
    const cx = Math.max(k.x, Math.min(k.x + k.w, crosshair.x));
    const cy = Math.max(k.y, Math.min(mrect.y + mrect.h, crosshair.y));
    ctx.strokeStyle = CROSS;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(cx) + 0.5, k.y);
    ctx.lineTo(Math.round(cx) + 0.5, mrect.y + mrect.h);
    ctx.stroke();
    if (cy <= k.y + k.h) {
      ctx.beginPath();
      ctx.moveTo(k.x, Math.round(cy) + 0.5);
      ctx.lineTo(k.x + k.w, Math.round(cy) + 0.5);
      ctx.stroke();
    } else if (cy >= mrect.y) {
      ctx.beginPath();
      ctx.moveTo(mrect.x, Math.round(cy) + 0.5);
      ctx.lineTo(mrect.x + mrect.w, Math.round(cy) + 0.5);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const idx = Math.round((cx - k.x) / view.barWidth + view.offset);
    const i = Math.max(0, Math.min(bars.length - 1, idx));
    const b = bars[i];
    if (b) {
      const bx = indexToX(i, view, layout) + view.barWidth / 2;
      ctx.fillStyle = "#21262d";
      ctx.strokeStyle = "rgba(230,237,243,0.2)";
      const label = formatAxisTime(b.time, periodMinutes);
      const tw = ctx.measureText(label).width + 12;
      const lx = Math.max(k.x, Math.min(k.x + k.w - tw, bx - tw / 2));
      ctx.fillRect(lx, layout.timeAxis.y + 1, tw, layout.timeAxis.h - 2);
      ctx.strokeRect(lx, layout.timeAxis.y + 1, tw, layout.timeAxis.h - 2);
      ctx.fillStyle = "#e6edf3";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, lx + tw / 2, timeY);

      const ohlc = `开 ${formatPrice(b.open)}  高 ${formatPrice(b.high)}  低 ${formatPrice(b.low)}  收 ${formatPrice(b.close)}`;
      const change = b.close - b.open;
      const pct = (change / b.open) * 100;
      const chg = `${change >= 0 ? "+" : ""}${formatPrice(change)}  (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#e6edf3";
      ctx.fillText(ohlc, k.x + 8, 8);
      ctx.fillStyle = change >= 0 ? UP : DOWN;
      ctx.fillText(chg, k.x + 8 + ctx.measureText(ohlc).width + 12, 8);

      if (cy <= k.y + k.h) {
        const price = kScale.max - ((cy - k.y) / k.h) * (kScale.max - kScale.min);
        const pl = formatPrice(price);
        const pw = ctx.measureText(pl).width + 10;
        ctx.fillStyle = "#21262d";
        ctx.fillRect(layout.axisY.x, cy - 8, Math.min(AXIS_Y_W - 2, pw + 4), 16);
        ctx.fillStyle = "#e6edf3";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(pl, layout.axisY.x + 6, cy);
      }
    }
  }

  ctx.restore();
}

function hexToRgba(hex: string, a: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}
