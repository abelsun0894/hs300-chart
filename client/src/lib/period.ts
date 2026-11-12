export const PERIOD_MIN = 1;
export const PERIOD_MAX = 1200;
export const MINUTES_PER_DAY = 240;
export const MINUTES_PER_WEEK = 1200;
export const SLIDER_MAX = 1000;

export function minutesToSlider(minutes: number): number {
  const m = Math.min(PERIOD_MAX, Math.max(PERIOD_MIN, minutes));
  const t = Math.log(m / PERIOD_MIN) / Math.log(PERIOD_MAX / PERIOD_MIN);
  return Math.round(t * SLIDER_MAX);
}

export function sliderToMinutes(slider: number): number {
  const t = Math.min(SLIDER_MAX, Math.max(0, slider)) / SLIDER_MAX;
  return Math.round(Math.exp(Math.log(PERIOD_MIN) + t * Math.log(PERIOD_MAX / PERIOD_MIN)));
}

export function formatPeriod(minutes: number): string {
  const m = Math.round(minutes);
  if (m <= 0) return "—";
  if (m === MINUTES_PER_WEEK) return "1周";
  if (m === MINUTES_PER_DAY) return "1日";
  if (m < 60) return `${m}分钟`;
  if (m < MINUTES_PER_DAY) {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r === 0 ? `${h}小时` : `${h}小时${r}分钟`;
  }
  const days = m / MINUTES_PER_DAY;
  if (Number.isInteger(days)) return `${days}日`;
  const whole = Math.floor(days);
  const rem = m - whole * MINUTES_PER_DAY;
  if (rem % 60 === 0) return `${whole}日${rem / 60}小时`;
  return `${whole}日${rem}分钟`;
}

export const SLIDER_TICKS: { minutes: number; label: string }[] = [
  { minutes: 1, label: "1分" },
  { minutes: 5, label: "5分" },
  { minutes: 15, label: "15分" },
  { minutes: 30, label: "30分" },
  { minutes: 60, label: "1小时" },
  { minutes: 120, label: "2小时" },
  { minutes: 240, label: "1日" },
  { minutes: 1200, label: "1周" },
];
