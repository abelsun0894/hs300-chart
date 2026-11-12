import { DENSITY_MIN, DEFAULT_VISIBLE_BARS } from "../lib/geometry";

const TICK_CANDIDATES = [20, 40, 80, 120, 200, 300, 500];

export default function DensitySlider({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const sliderMax = Math.max(DENSITY_MIN, Math.round(max || DEFAULT_VISIBLE_BARS * 2));
  const shown = Math.max(DENSITY_MIN, Math.min(sliderMax, Math.round(value)));
  const ticks = TICK_CANDIDATES.filter((n) => n >= DENSITY_MIN && n <= sliderMax);

  return (
    <div className="slider-bar density-slider">
      <div className="slider-top">
        <span className="label">一屏显示的 K 线数量（{DENSITY_MIN} – {sliderMax} 根）</span>
        <span className="value">显示 {shown} 根</span>
      </div>
      <input
        type="range"
        min={DENSITY_MIN}
        max={sliderMax}
        step={1}
        value={shown}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="K线密度"
      />
      <div className="ticks">
        {ticks.map((n) => (
          <span
            key={n}
            style={{ left: `${((n - DENSITY_MIN) / (sliderMax - DENSITY_MIN || 1)) * 100}%` }}
          >
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}
