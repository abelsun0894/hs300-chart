export type Bar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type MacdPoint = {
  time: number;
  dif: number | null;
  dea: number | null;
  hist: number | null;
};

export type Annotation = {
  id: string;
  type: "line" | "box";
  t1: number;
  p1: number;
  t2: number;
  p2: number;
  color: string;
};

export type MarketBundle = {
  symbol: string;
  name: string;
  data: {
    "1m"?: { bars: Bar[]; source: string; fetchedAt: number; stale?: boolean };
    "5m"?: { bars: Bar[]; source: string; fetchedAt: number; stale?: boolean };
    "60m"?: { bars: Bar[]; source: string; fetchedAt: number; stale?: boolean };
    "1d"?: { bars: Bar[]; source: string; fetchedAt: number; stale?: boolean };
  };
  errors?: Record<string, string>;
};

export type User = { id: number; email: string };

export type Tool = "none" | "line" | "box";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";
