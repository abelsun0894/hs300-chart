import { db } from "./db.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const TTL_MS = {
  "1m": 60 * 1000,
  "5m": 60 * 1000,
  "60m": 60 * 1000,
  "1d": 5 * 60 * 1000,
};

function parseShanghai(s) {
  const t = String(s).trim();
  let iso;
  if (/^\d{12}$/.test(t)) {
    iso = `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(8, 10)}:${t.slice(10, 12)}:00`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    iso = `${t}T15:00:00`;
  } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(t)) {
    iso = t.replace(" ", "T");
    if (iso.length === 16) iso += ":00";
  } else if (/^\d{4}-\d{2}-\d{2}T/.test(t)) {
    iso = t;
  } else {
    throw new Error(`无法解析时间: ${t}`);
  }
  const ms = new Date(`${iso}+08:00`).getTime();
  if (!Number.isFinite(ms)) throw new Error(`无法解析时间: ${t}`);
  return Math.floor(ms / 1000);
}

function bar(time, open, high, low, close) {
  const o = Number(open);
  const h = Number(high);
  const l = Number(low);
  const c = Number(close);
  if (![o, h, l, c].every(Number.isFinite)) return null;
  return { time, open: o, high: h, low: l, close: c };
}

async function fetchText(url, referer = "https://finance.sina.com.cn/") {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Referer: referer,
      Accept: "*/*",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

async function fetchJson(url, referer) {
  const text = await fetchText(url, referer);
  if (!text || text.trim() === "" || text.trim() === "null") return null;
  return JSON.parse(text);
}

function parseSinaList(data) {
  if (!Array.isArray(data) || data.length === 0) return [];
  const out = [];
  for (const row of data) {
    const b = bar(parseShanghai(row.day), row.open, row.high, row.low, row.close);
    if (b) out.push(b);
  }
  return out;
}

async function fetchSina(scale, datalen) {
  const urls = [
    `https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData?symbol=sh000300&scale=${scale}&ma=no&datalen=${datalen}`,
    `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=sh000300&scale=${scale}&ma=no&datalen=${datalen}`,
  ];
  let lastErr;
  for (const url of urls) {
    try {
      const data = await fetchJson(url);
      const bars = parseSinaList(data);
      if (bars.length) return bars;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  return [];
}

function parseTencentBars(rows) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const b = bar(parseShanghai(String(row[0])), row[1], row[3], row[4], row[2]);
    // Tencent day format: [date, open, close, high, low, volume]
    // Tencent mkline m1: [YYYYMMDDHHmm, open, close, high, low, vol]
    // Both are open, close, high, low at indices 1-4
    if (b) out.push(b);
  }
  return out;
}

async function fetchTencentMinute(kind, count) {
  const url = `https://ifzq.gtimg.cn/appstock/app/kline/mkline?param=sh000300,${kind},,${count}`;
  const data = await fetchJson(url, "https://finance.qq.com/");
  const rows = data?.data?.sh000300?.[kind];
  return parseTencentBars(rows);
}

async function fetchTencentDay(count) {
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh000300,day,,,${count},qfq`;
  const data = await fetchJson(url, "https://finance.qq.com/");
  const block = data?.data?.sh000300 || {};
  const rows = block.day || block.qfqday || [];
  return parseTencentBars(rows);
}

function uniqueSort(bars) {
  const map = new Map();
  for (const b of bars) map.set(b.time, b);
  return [...map.values()].sort((a, c) => a.time - c.time);
}

async function fetchInterval(interval) {
  if (interval === "1m") {
    for (const n of [1800, 1500, 1023]) {
      try {
        const bars = await fetchSina(1, n);
        if (bars.length) return { bars: uniqueSort(bars), source: `sina-1m-${bars.length}` };
      } catch {
        // try next size / fallback
      }
    }
    const bars = await fetchTencentMinute("m1", 320);
    if (bars.length) return { bars: uniqueSort(bars), source: `tencent-m1-${bars.length}` };
    throw new Error("无法获取沪深300的1分钟K线");
  }

  if (interval === "5m") {
    try {
      const bars = await fetchSina(5, 1023);
      if (bars.length) return { bars: uniqueSort(bars), source: `sina-5m-${bars.length}` };
    } catch {
      // fallback
    }
    const bars = await fetchTencentMinute("m5", 800);
    if (bars.length) return { bars: uniqueSort(bars), source: `tencent-m5-${bars.length}` };
    throw new Error("无法获取沪深300的5分钟K线");
  }

  if (interval === "60m") {
    try {
      const bars = await fetchSina(60, 1023);
      if (bars.length) return { bars: uniqueSort(bars), source: `sina-60m-${bars.length}` };
    } catch {
      // fallback
    }
    const bars = await fetchTencentMinute("m60", 800);
    if (bars.length) return { bars: uniqueSort(bars), source: `tencent-m60-${bars.length}` };
    throw new Error("无法获取沪深300的60分钟K线");
  }

  if (interval === "1d") {
    try {
      const bars = await fetchSina(240, 2048);
      if (bars.length) return { bars: uniqueSort(bars), source: `sina-1d-${bars.length}` };
    } catch {
      // fallback
    }
    const bars = await fetchTencentDay(1000);
    if (bars.length) return { bars: uniqueSort(bars), source: `tencent-1d-${bars.length}` };
    throw new Error("无法获取沪深300的日线");
  }

  throw new Error("不支持的周期");
}

function readCache(interval) {
  const row = db
    .prepare("SELECT data_json, fetched_at FROM market_cache WHERE interval = ?")
    .get(interval);
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.data_json);
    return { ...parsed, fetchedAt: row.fetched_at };
  } catch {
    return null;
  }
}

function writeCache(interval, payload) {
  const fetchedAt = Date.now();
  db.prepare(
    `INSERT INTO market_cache (interval, data_json, fetched_at)
     VALUES (?, ?, ?)
     ON CONFLICT(interval) DO UPDATE SET data_json = excluded.data_json, fetched_at = excluded.fetched_at`
  ).run(interval, JSON.stringify(payload), fetchedAt);
  return fetchedAt;
}

export async function getMarketBars(interval, { force = false } = {}) {
  const ttl = TTL_MS[interval] ?? 60 * 1000;
  const cached = readCache(interval);
  if (!force && cached && Date.now() - cached.fetchedAt < ttl && cached.bars?.length) {
    return { ...cached, stale: false };
  }

  try {
    const fresh = await fetchInterval(interval);
    const fetchedAt = writeCache(interval, { bars: fresh.bars, source: fresh.source });
    return { bars: fresh.bars, source: fresh.source, fetchedAt, stale: false };
  } catch (err) {
    if (cached?.bars?.length) {
      return { ...cached, stale: true, error: String(err.message || err) };
    }
    throw err;
  }
}

export async function getAllMarketData() {
  const intervals = ["1m", "5m", "60m", "1d"];
  const result = {};
  const errors = {};
  await Promise.all(
    intervals.map(async (iv) => {
      try {
        result[iv] = await getMarketBars(iv);
      } catch (err) {
        errors[iv] = String(err.message || err);
      }
    })
  );
  if (!result["1m"] && !result["1d"]) {
    const e = new Error("行情数据暂时不可用：" + Object.values(errors).join("；"));
    e.status = 502;
    throw e;
  }
  return {
    symbol: "sh000300",
    name: "沪深300",
    data: result,
    errors: Object.keys(errors).length ? errors : undefined,
  };
}
