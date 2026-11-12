import { getAnnotationRow, upsertAnnotation } from "./store.js";

const MAX_ITEMS = 200;
const COLORS = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

function isNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}

export function sanitizePayload(body) {
  const periodMinutes = Math.round(Number(body?.periodMinutes));
  if (!Number.isFinite(periodMinutes) || periodMinutes < 1 || periodMinutes > 1200) {
    const e = new Error("周期无效");
    e.status = 400;
    throw e;
  }
  const raw = Array.isArray(body?.items) ? body.items : [];
  if (raw.length > MAX_ITEMS) {
    const e = new Error("标注数量过多");
    e.status = 400;
    throw e;
  }
  const items = [];
  for (const it of raw) {
    if (!it || (it.type !== "line" && it.type !== "box")) continue;
    if (!isNum(it.t1) || !isNum(it.p1) || !isNum(it.t2) || !isNum(it.p2)) continue;
    const color = typeof it.color === "string" && COLORS.test(it.color) ? it.color : "#58a6ff";
    const id = typeof it.id === "string" && it.id.length <= 64 ? it.id : crypto.randomUUID();
    items.push({
      id,
      type: it.type,
      t1: it.t1,
      p1: it.p1,
      t2: it.t2,
      p2: it.p2,
      color,
    });
  }
  let visibleBars = Math.round(Number(body?.visibleBars));
  if (!Number.isFinite(visibleBars)) visibleBars = 80;
  visibleBars = Math.max(20, Math.min(500, visibleBars));
  return { periodMinutes, items, visibleBars };
}

export async function getAnnotations(userId) {
  const row = await getAnnotationRow(userId);
  if (!row) {
    return { periodMinutes: 15, visibleBars: 80, items: [], updatedAt: null };
  }
  let items = [];
  try {
    items = JSON.parse(row.items_json);
    if (!Array.isArray(items)) items = [];
  } catch {
    items = [];
  }
  return {
    periodMinutes: row.period_minutes,
    visibleBars: row.visible_bars ?? 80,
    items,
    updatedAt: row.updated_at,
  };
}

export async function saveAnnotations(userId, payload) {
  const { periodMinutes, items, visibleBars } = sanitizePayload(payload);
  await upsertAnnotation(userId, periodMinutes, visibleBars, JSON.stringify(items));
  return getAnnotations(userId);
}
