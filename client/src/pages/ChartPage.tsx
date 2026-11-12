import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { Annotation, MarketBundle, SaveStatus, Tool, User } from "../types";
import Toolbar from "../components/Toolbar";
import PeriodSlider from "../components/PeriodSlider";
import DensitySlider from "../components/DensitySlider";
import ChartCanvas from "../components/ChartCanvas";
import { buildChartBars } from "../lib/aggregate";
import { computeMacd } from "../lib/macd";
import { formatPeriod } from "../lib/period";
import { DEFAULT_VISIBLE_BARS, DENSITY_MAX, DENSITY_MIN } from "../lib/geometry";

export default function ChartPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [bundle, setBundle] = useState<MarketBundle["data"] | null>(null);
  const [marketMeta, setMarketMeta] = useState("");
  const [marketError, setMarketError] = useState("");
  const [loading, setLoading] = useState(true);
  const [periodMinutes, setPeriodMinutes] = useState(15);
  const [visibleBars, setVisibleBars] = useState(DEFAULT_VISIBLE_BARS);
  const [densityMax, setDensityMax] = useState(300);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("none");
  const [color, setColor] = useState("#58a6ff");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [toast, setToast] = useState("");
  const loadedRef = useRef(false);
  const skipSaveRef = useRef(true);
  const timerRef = useRef<number>(0);
  const periodRef = useRef(periodMinutes);
  const visibleBarsRef = useRef(visibleBars);
  const annsRef = useRef(annotations);
  periodRef.current = periodMinutes;
  visibleBarsRef.current = visibleBars;
  annsRef.current = annotations;

  const loadMarket = useCallback(async () => {
    try {
      const data = await api.market();
      setBundle(data.data);
      const parts = (["1m", "5m", "60m", "1d"] as const)
        .map((k) => (data.data[k]?.bars?.length ? `${k}:${data.data[k]!.bars.length}` : null))
        .filter(Boolean);
      const stale = (["1m", "5m", "60m", "1d"] as const).some((k) => data.data[k]?.stale);
      setMarketMeta(`${data.name}  ${parts.join("  ")}${stale ? "  （缓存）" : ""}`);
      setMarketError("");
    } catch (err) {
      setMarketError(err instanceof Error ? err.message : "行情加载失败");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [ann, _m] = await Promise.all([api.getAnnotations(), loadMarket()]);
        if (cancelled) return;
        setPeriodMinutes(ann.periodMinutes || 15);
        const vb = Math.round(Number(ann.visibleBars));
        setVisibleBars(
          Number.isFinite(vb) ? Math.max(DENSITY_MIN, Math.min(DENSITY_MAX, vb)) : DEFAULT_VISIBLE_BARS
        );
        setAnnotations(ann.items || []);
        loadedRef.current = true;
        skipSaveRef.current = true;
        setSaveStatus("saved");
      } catch (err) {
        if (!cancelled) {
          setToast(err instanceof Error ? err.message : "加载失败");
          loadedRef.current = true;
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const id = window.setInterval(loadMarket, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [loadMarket]);

  const save = useCallback(async (manual = false) => {
    setSaveStatus("saving");
    try {
      await api.saveAnnotations(periodRef.current, annsRef.current, visibleBarsRef.current);
      setSaveStatus("saved");
      if (manual) {
        setToast("已保存，其他设备刷新后即可看到");
        window.setTimeout(() => setToast(""), 2200);
      }
    } catch (err) {
      setSaveStatus("error");
      setToast(err instanceof Error ? err.message : "保存失败");
    }
  }, []);

  useEffect(() => {
    if (!loadedRef.current) return;
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    setSaveStatus("dirty");
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void save(false);
    }, 1500);
    return () => window.clearTimeout(timerRef.current);
  }, [annotations, periodMinutes, visibleBars, save]);

  const chart = useMemo(() => {
    if (!bundle) return { bars: [], source: "", basePeriod: 1 };
    return buildChartBars(periodMinutes, bundle);
  }, [bundle, periodMinutes]);

  const macd = useMemo(() => computeMacd(chart.bars), [chart.bars]);

  const selected = annotations.find((a) => a.id === selectedId) || null;

  function handleColor(c: string) {
    setColor(c);
    if (selected) {
      setAnnotations((list) => list.map((a) => (a.id === selected.id ? { ...a, color: c } : a)));
    }
  }

  function handleSelect(id: string | null) {
    setSelectedId(id);
    const item = annotations.find((a) => a.id === id);
    if (item) setColor(item.color);
  }

  async function logout() {
    try {
      if (saveStatus === "dirty") await save(false);
      await api.logout();
    } finally {
      onLogout();
    }
  }

  return (
    <div className="app-shell">
      <header className="header">
        <div className="brand">
          <h1>沪深300</h1>
          <span className="sub">
            {marketMeta || "指数 K 线"}
            {chart.source ? `  · 当前${formatPeriod(periodMinutes)}由${chart.basePeriod}分钟数据聚合` : ""}
          </span>
        </div>
        <div className="header-right">
          <span className="email">{user.email}</span>
          <button type="button" className="btn ghost" onClick={() => void logout()}>
            退出
          </button>
        </div>
      </header>
      <Toolbar
        tool={tool}
        color={color}
        canDelete={Boolean(selected)}
        saveStatus={saveStatus}
        onTool={setTool}
        onColor={handleColor}
        onDelete={() => {
          if (!selectedId) return;
          setAnnotations((list) => list.filter((a) => a.id !== selectedId));
          setSelectedId(null);
        }}
        onSave={() => void save(true)}
      />
      <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex" }}>
        {loading && !bundle ? <div className="chart-loading">正在加载行情…</div> : null}
        {marketError && !bundle ? <div className="chart-empty">{marketError}</div> : null}
        {bundle ? (
          <ChartCanvas
            bars={chart.bars}
            macd={macd}
            annotations={annotations}
            selectedId={selectedId}
            tool={tool}
            color={color}
            periodMinutes={periodMinutes}
            visibleBars={visibleBars}
            onVisibleBarsChange={setVisibleBars}
            onDensityMaxChange={(max) => setDensityMax((cur) => (cur === max ? cur : max))}
            onAnnotationsChange={(items, id) => {
              setAnnotations(items);
              setSelectedId(id);
              if (id) {
                const it = items.find((a) => a.id === id);
                if (it) setColor(it.color);
              }
            }}
            onSelect={handleSelect}
          />
        ) : null}
        {toast ? <div className="toast">{toast}</div> : null}
      </div>
      <div className="sliders-dock">
        <PeriodSlider minutes={periodMinutes} onChange={setPeriodMinutes} />
        <DensitySlider value={visibleBars} max={densityMax} onChange={setVisibleBars} />
      </div>
    </div>
  );
}
