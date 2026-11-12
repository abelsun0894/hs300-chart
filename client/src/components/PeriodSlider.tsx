import { formatPeriod, minutesToSlider, PERIOD_MIN, sliderToMinutes, SLIDER_MAX, SLIDER_TICKS } from "../lib/period";

export default function PeriodSlider({
  minutes,
  onChange,
}: {
  minutes: number;
  onChange: (m: number) => void;
}) {
  return (
    <div className="slider-bar">
      <div className="slider-top">
        <span className="label">一根 K 线代表的时间（对数刻度，{PERIOD_MIN}分钟 – 1周）</span>
        <span className="value">{formatPeriod(minutes)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={SLIDER_MAX}
        step={1}
        value={minutesToSlider(minutes)}
        onChange={(e) => onChange(sliderToMinutes(Number(e.target.value)))}
        aria-label="周期滑块"
      />
      <div className="ticks">
        {SLIDER_TICKS.map((t) => (
          <span
            key={t.minutes}
            style={{ left: `${(minutesToSlider(t.minutes) / SLIDER_MAX) * 100}%` }}
          >
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}
