import { useEffect, useRef } from "react";
import type { Annotation, Bar, MacdPoint, Tool } from "../types";
import {
  autoPriceScale,
  clampView,
  computeLayout,
  defaultView,
  densityLimits,
  hitAnnotation,
  hitHandle,
  type Handle,
  type Layout,
  type PriceScale,
  type ViewState,
  snapPoint,
  timeToX,
  viewFromDensity,
  visibleBarsOf,
  xToTime,
  yToPrice,
  zoomAround,
} from "../lib/geometry";
import { renderChart } from "../lib/render";

type Props = {
  bars: Bar[];
  macd: MacdPoint[];
  annotations: Annotation[];
  selectedId: string | null;
  tool: Tool;
  color: string;
  periodMinutes: number;
  visibleBars: number;
  onVisibleBarsChange: (n: number) => void;
  onDensityMaxChange?: (max: number) => void;
  onAnnotationsChange: (items: Annotation[], selectedId: string | null) => void;
  onSelect: (id: string | null) => void;
};

type Drag =
  | { type: "pan"; lastX: number; pointerId: number }
  | { type: "draw"; pointerId: number; id: string; kind: "line" | "box" }
  | { type: "handle"; pointerId: number; handle: Handle; timeField?: "t1" | "t2"; priceField?: "p1" | "p2" }
  | { type: "pinch"; idA: number; idB: number; dist: number; midX: number };

function uid() {
  return crypto.randomUUID();
}

function fieldForTime(a: Annotation, which: "left" | "right"): "t1" | "t2" {
  const leftIsT1 = a.t1 <= a.t2;
  return which === "left" ? (leftIsT1 ? "t1" : "t2") : leftIsT1 ? "t2" : "t1";
}

function fieldForPrice(a: Annotation, which: "top" | "bottom"): "p1" | "p2" {
  const topIsP1 = a.p1 >= a.p2;
  return which === "top" ? (topIsP1 ? "p1" : "p2") : topIsP1 ? "p2" : "p1";
}

export default function ChartCanvas(props: Props) {
  const propsRef = useRef(props);
  propsRef.current = props;

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<ViewState>({ offset: 0, barWidth: 8 });
  const layoutRef = useRef<Layout | null>(null);
  const scaleRef = useRef<PriceScale>({ min: 0, max: 1 });
  const viewReadyFor = useRef(0);
  const dragRef = useRef<Drag | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const frameRef = useRef<number>(0);
  const lastDensityMaxRef = useRef(0);

  function currentScale(layout: Layout, bars: Bar[], view: ViewState): PriceScale {
    const start = Math.max(0, Math.floor(view.offset) - 1);
    const end = Math.min(bars.length - 1, Math.ceil(view.offset + layout.k.w / view.barWidth) + 1);
    return autoPriceScale(bars, start, end);
  }

  function draw() {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const { bars, macd, annotations, selectedId, periodMinutes, visibleBars } = propsRef.current;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssW = wrap.clientWidth;
    const cssH = wrap.clientHeight;
    if (cssW < 10 || cssH < 10) return;
    const isMobile = cssW < 720;
    const layout = computeLayout(cssW, cssH, isMobile);
    layoutRef.current = layout;

    const limits = densityLimits(layout.k.w);
    if (limits.max !== lastDensityMaxRef.current) {
      lastDensityMaxRef.current = limits.max;
      propsRef.current.onDensityMaxChange?.(limits.max);
    }

    const viewKey = bars.length * 1_000_000 + (bars[0]?.time || 0) + (bars.at(-1)?.time || 0);
    const currentVis = visibleBarsOf(viewRef.current, layout);
    if (viewKey !== viewReadyFor.current) {
      viewRef.current = defaultView(bars.length, layout, visibleBars);
      viewReadyFor.current = viewKey;
    } else if (Math.abs(currentVis - visibleBars) > 0.6) {
      // 密度滑块（或外部状态）变化：按新根数重算，尽量保持视窗中心或右端
      viewRef.current = viewFromDensity(layout, visibleBars, bars.length, viewRef.current);
    } else {
      viewRef.current = clampView(viewRef.current, layout, bars.length);
    }

    const view = viewRef.current;
    const scale = currentScale(layout, bars, view);
    scaleRef.current = scale;

    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderChart({
      ctx,
      layout,
      bars,
      macd,
      view,
      kScale: scale,
      annotations,
      selectedId,
      crosshair: hoverRef.current,
      periodMinutes,
      dpr,
    });
  }

  function requestDraw() {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      draw();
    });
  }

  function syncDensityFromView() {
    const layout = layoutRef.current;
    if (!layout) return;
    const vis = Math.round(visibleBarsOf(viewRef.current, layout));
    const { min, max } = densityLimits(layout.k.w);
    const clamped = Math.max(min, Math.min(max, vis));
    if (clamped !== propsRef.current.visibleBars) {
      propsRef.current.onVisibleBarsChange(clamped);
    }
  }

  useEffect(() => {
    requestDraw();
  });

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => requestDraw());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  function localXY(e: PointerEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function pointAt(x: number, y: number, doSnap: boolean) {
    const p = propsRef.current;
    const layout = layoutRef.current!;
    const view = viewRef.current;
    const scale = scaleRef.current;
    const time = xToTime(x, p.bars, view, layout);
    const price = yToPrice(Math.max(layout.k.y, Math.min(layout.k.y + layout.k.h, y)), scale, layout.k);
    if (!doSnap) return { time, price, snapped: false };
    return snapPoint(time, price, p.bars, view, layout, scale, 14);
  }

  function updateItem(id: string, patch: Partial<Annotation>) {
    const items = propsRef.current.annotations.map((a) => (a.id === id ? { ...a, ...patch } : a));
    propsRef.current.onAnnotationsChange(items, id);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onPointerDown = (e: PointerEvent) => {
      const p = propsRef.current;
      const layout = layoutRef.current;
      if (!layout || !p.bars.length) return;
      const { x, y } = localXY(e);
      pointersRef.current.set(e.pointerId, { x, y });

      if (pointersRef.current.size === 2) {
        const pts = [...pointersRef.current.entries()];
        const a = pts[0];
        const b = pts[1];
        const dist = Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y);
        const midX = (a[1].x + b[1].x) / 2;
        dragRef.current = { type: "pinch", idA: a[0], idB: b[0], dist: dist || 1, midX };
        canvas.setPointerCapture(e.pointerId);
        return;
      }

      canvas.setPointerCapture(e.pointerId);
      hoverRef.current = { x, y };

      const inK = y >= layout.k.y && y <= layout.k.y + layout.k.h && x >= layout.k.x && x <= layout.k.x + layout.k.w;

      if (inK && p.tool !== "none") {
        const pt = pointAt(x, y, true);
        const id = uid();
        const item: Annotation = {
          id,
          type: p.tool,
          t1: pt.time,
          p1: pt.price,
          t2: pt.time,
          p2: pt.price,
          color: p.color,
        };
        propsRef.current.onAnnotationsChange([...p.annotations, item], id);
        dragRef.current = { type: "draw", pointerId: e.pointerId, id, kind: p.tool };
        requestDraw();
        return;
      }

      if (inK && p.selectedId) {
        const handle = hitHandle(
          x, y, p.annotations, p.bars, viewRef.current, layout, scaleRef.current, p.selectedId, 16
        );
        if (handle) {
          const cur = p.annotations.find((it) => it.id === handle.id);
          let timeField: "t1" | "t2" | undefined;
          let priceField: "p1" | "p2" | undefined;
          if (cur && handle.kind === "box-corner") {
            timeField = fieldForTime(cur, handle.h);
            priceField = fieldForPrice(cur, handle.v);
          } else if (cur && handle.kind === "box-edge") {
            if (handle.edge === "left" || handle.edge === "right") timeField = fieldForTime(cur, handle.edge);
            else priceField = fieldForPrice(cur, handle.edge);
          }
          dragRef.current = { type: "handle", pointerId: e.pointerId, handle, timeField, priceField };
          requestDraw();
          return;
        }
      }

      if (inK) {
        const hit = hitAnnotation(x, y, p.annotations, p.bars, viewRef.current, layout, scaleRef.current, 12);
        if (hit) {
          p.onSelect(hit);
          const handle = hitHandle(
            x, y, p.annotations, p.bars, viewRef.current, layout, scaleRef.current, hit, 16
          );
          if (handle) {
            const cur = p.annotations.find((it) => it.id === handle.id);
            let timeField: "t1" | "t2" | undefined;
            let priceField: "p1" | "p2" | undefined;
            if (cur && handle.kind === "box-corner") {
              timeField = fieldForTime(cur, handle.h);
              priceField = fieldForPrice(cur, handle.v);
            } else if (cur && handle.kind === "box-edge") {
              if (handle.edge === "left" || handle.edge === "right") timeField = fieldForTime(cur, handle.edge);
              else priceField = fieldForPrice(cur, handle.edge);
            }
            dragRef.current = { type: "handle", pointerId: e.pointerId, handle, timeField, priceField };
          } else dragRef.current = { type: "pan", lastX: x, pointerId: e.pointerId };
          requestDraw();
          return;
        }
        p.onSelect(null);
      }

      dragRef.current = { type: "pan", lastX: x, pointerId: e.pointerId };
      requestDraw();
    };

    const onPointerMove = (e: PointerEvent) => {
      const layout = layoutRef.current;
      if (!layout) return;
      const { x, y } = localXY(e);
      if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x, y });

      const drag = dragRef.current;
      if (drag?.type === "pinch") {
        const a = pointersRef.current.get(drag.idA);
        const b = pointersRef.current.get(drag.idB);
        if (a && b) {
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          const midX = (a.x + b.x) / 2;
          const factor = dist / (drag.dist || 1);
          viewRef.current = zoomAround(viewRef.current, layout, midX, factor, propsRef.current.bars.length);
          const dx = midX - drag.midX;
          viewRef.current = clampView(
            { ...viewRef.current, offset: viewRef.current.offset - dx / viewRef.current.barWidth },
            layout,
            propsRef.current.bars.length
          );
          dragRef.current = { ...drag, dist: dist || drag.dist, midX };
          hoverRef.current = null;
          syncDensityFromView();
          requestDraw();
        }
        return;
      }

      hoverRef.current = { x, y };

      if (drag?.type === "pan" && drag.pointerId === e.pointerId) {
        const dx = x - drag.lastX;
        viewRef.current = clampView(
          { ...viewRef.current, offset: viewRef.current.offset - dx / viewRef.current.barWidth },
          layout,
          propsRef.current.bars.length
        );
        drag.lastX = x;
        requestDraw();
        return;
      }

      if (drag?.type === "draw" && drag.pointerId === e.pointerId) {
        const pt = pointAt(x, y, true);
        updateItem(drag.id, { t2: pt.time, p2: pt.price });
        requestDraw();
        return;
      }

      if (drag?.type === "handle" && drag.pointerId === e.pointerId) {
        const pt = pointAt(x, y, true);
        const a = propsRef.current.annotations.find((it) => it.id === drag.handle.id);
        if (a) {
          if (drag.handle.kind === "line-end") {
            if (drag.handle.end === 1) updateItem(a.id, { t1: pt.time, p1: pt.price });
            else updateItem(a.id, { t2: pt.time, p2: pt.price });
          } else if (drag.handle.kind === "box-corner") {
            const tf = drag.timeField ?? fieldForTime(a, drag.handle.h);
            const pf = drag.priceField ?? fieldForPrice(a, drag.handle.v);
            updateItem(a.id, { [tf]: pt.time, [pf]: pt.price });
          } else if (drag.handle.kind === "box-edge") {
            if (drag.handle.edge === "left" || drag.handle.edge === "right") {
              const tf = drag.timeField ?? fieldForTime(a, drag.handle.edge);
              updateItem(a.id, { [tf]: pt.time });
            } else {
              const pf = drag.priceField ?? fieldForPrice(a, drag.handle.edge);
              updateItem(a.id, { [pf]: pt.price });
            }
          }
        }
        requestDraw();
        return;
      }

      requestDraw();
    };

    const onPointerUp = (e: PointerEvent) => {
      pointersRef.current.delete(e.pointerId);
      const drag = dragRef.current;
      if (drag?.type === "pinch") {
        if (pointersRef.current.size < 2) dragRef.current = null;
        return;
      }
      if (drag && "pointerId" in drag && drag.pointerId === e.pointerId) {
        if (drag.type === "draw") {
          const a = propsRef.current.annotations.find((it) => it.id === drag.id);
          if (a) {
            const x1 = timeToX(a.t1, propsRef.current.bars, viewRef.current, layoutRef.current!);
            const x2 = timeToX(a.t2, propsRef.current.bars, viewRef.current, layoutRef.current!);
            const tooSmall = Math.hypot(x2 - x1, 0) < 4 && Math.abs(a.p1 - a.p2) < 1e-6;
            // also consider pixel distance in price
            const layout = layoutRef.current!;
            const y1 = (a.p1 - scaleRef.current.max);
            void y1;
            const dx = Math.abs(x2 - x1);
            const py = Math.abs(
              // reuse price scale
              ((scaleRef.current.max - a.p1) / (scaleRef.current.max - scaleRef.current.min || 1)) * layout.k.h -
                ((scaleRef.current.max - a.p2) / (scaleRef.current.max - scaleRef.current.min || 1)) * layout.k.h
            );
            if (dx < 6 && py < 6) {
              propsRef.current.onAnnotationsChange(
                propsRef.current.annotations.filter((it) => it.id !== a.id),
                null
              );
            }
            void tooSmall;
          }
        }
        dragRef.current = null;
      }
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      requestDraw();
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const layout = layoutRef.current;
      if (!layout) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      viewRef.current = zoomAround(viewRef.current, layout, x, factor, propsRef.current.bars.length);
      syncDensityFromView();
      requestDraw();
    };

    const onLeave = () => {
      if (!dragRef.current) {
        hoverRef.current = null;
        requestDraw();
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} />
      {!props.bars.length ? <div className="chart-empty">暂无K线数据</div> : null}
    </div>
  );
}
