const SH = "Asia/Shanghai";

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: SH,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

export type ShParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dateKey: string;
  weekday: number; // Mon=0 ... Sun=6
};

export function shanghaiParts(ts: number): ShParts {
  const parts = fmt.formatToParts(new Date(ts * 1000));
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const wd = get("weekday"); // Mon, Tue, ...
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return {
    year,
    month,
    day,
    hour,
    minute,
    dateKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    weekday: map[wd] ?? 0,
  };
}

export function isoWeekKey(p: ShParts): string {
  // ISO week: Monday is start. Use UTC date of the Shanghai calendar day + Thursday trick.
  const utc = Date.UTC(p.year, p.month - 1, p.day);
  const date = new Date(utc);
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * 将 K 线结束时刻映射到当日交易分钟 0..239。
 * 新浪 1 分钟标签为 09:31-11:30、13:01-14:58、15:00（通常缺 14:59）。
 */
export function tradingMinuteOf(ts: number): number {
  const { hour, minute } = shanghaiParts(ts);
  const m = hour * 60 + minute;
  if (m >= 9 * 60 + 31 && m <= 11 * 60 + 30) return m - (9 * 60 + 31);
  if (m >= 13 * 60 + 1 && m <= 14 * 60 + 59) return 120 + (m - (13 * 60 + 1));
  if (m === 15 * 60) return 239;
  if (m === 9 * 60 + 30) return 0;
  if (m === 13 * 60) return 120;
  if (m < 9 * 60 + 30) return 0;
  if (m > 11 * 60 + 30 && m < 13 * 60) return 119;
  return 239;
}

export function formatAxisTime(ts: number, periodMinutes: number): string {
  const p = shanghaiParts(ts);
  const hm = `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
  const md = `${p.month}/${p.day}`;
  if (periodMinutes >= 240) return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  if (periodMinutes >= 60) return `${md} ${hm}`;
  return `${md} ${hm}`;
}

export function formatCrosshairTime(ts: number, periodMinutes: number): string {
  const p = shanghaiParts(ts);
  const date = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  if (periodMinutes >= 240) return date;
  const hm = `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
  return `${date} ${hm}`;
}

export function formatPrice(n: number, digits = 2): string {
  return n.toFixed(digits);
}
