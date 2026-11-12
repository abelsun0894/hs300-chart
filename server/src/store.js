// 用户与标注的存储层：设置 DATABASE_URL 时使用 PostgreSQL（适合云端部署，数据持久），
// 否则使用本地 SQLite（server/data/app.db）。行情缓存始终在本地 SQLite。
import { db } from "./db.js";

const usePg = Boolean(process.env.DATABASE_URL);
export const storageKind = usePg ? "postgres" : "sqlite";

let pool = null;

function uniqueError() {
  const e = new Error("该邮箱已注册");
  e.status = 409;
  return e;
}

export async function initStore() {
  if (!usePg) return;
  const { default: pg } = await import("pg");
  const url = process.env.DATABASE_URL;
  const local = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url) || url.includes("host=/");
  const internal = !url.includes(".render.com");
  const ssl =
    process.env.PGSSL === "0" || local || (internal && process.env.PGSSL !== "1")
      ? false
      : { rejectUnauthorized: false };
  pool = new pg.Pool({ connectionString: url, ssl, max: 5 });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS')
    );
    CREATE TABLE IF NOT EXISTS annotations (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      period_minutes INTEGER NOT NULL DEFAULT 15,
      items_json TEXT NOT NULL DEFAULT '[]',
      visible_bars INTEGER NOT NULL DEFAULT 80,
      updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS')
    );
    ALTER TABLE annotations ADD COLUMN IF NOT EXISTS visible_bars INTEGER NOT NULL DEFAULT 80;
  `);
}

export async function findUserById(id) {
  if (!usePg) return db.prepare("SELECT id, email FROM users WHERE id = ?").get(id) || null;
  const { rows } = await pool.query("SELECT id, email FROM users WHERE id = $1", [id]);
  return rows[0] || null;
}

export async function findUserByEmail(email) {
  if (!usePg) {
    return db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(email) || null;
  }
  const { rows } = await pool.query("SELECT id, email, password_hash FROM users WHERE email = $1", [email]);
  return rows[0] || null;
}

export async function insertUser(email, passwordHash) {
  if (!usePg) {
    try {
      const result = db
        .prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
        .run(email, passwordHash);
      return Number(result.lastInsertRowid);
    } catch (err) {
      if (String(err.message).includes("UNIQUE")) throw uniqueError();
      throw err;
    }
  }
  try {
    const { rows } = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
      [email, passwordHash]
    );
    return Number(rows[0].id);
  } catch (err) {
    if (err.code === "23505") throw uniqueError();
    throw err;
  }
}

export async function getAnnotationRow(userId) {
  if (!usePg) {
    return (
      db
        .prepare("SELECT period_minutes, visible_bars, items_json, updated_at FROM annotations WHERE user_id = ?")
        .get(userId) || null
    );
  }
  const { rows } = await pool.query(
    "SELECT period_minutes, visible_bars, items_json, updated_at FROM annotations WHERE user_id = $1",
    [userId]
  );
  return rows[0] || null;
}

export async function upsertAnnotation(userId, periodMinutes, visibleBars, itemsJson) {
  if (!usePg) {
    db.prepare(
      `INSERT INTO annotations (user_id, period_minutes, visible_bars, items_json, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         period_minutes = excluded.period_minutes,
         visible_bars = excluded.visible_bars,
         items_json = excluded.items_json,
         updated_at = datetime('now')`
    ).run(userId, periodMinutes, visibleBars, itemsJson);
    return;
  }
  await pool.query(
    `INSERT INTO annotations (user_id, period_minutes, visible_bars, items_json, updated_at)
     VALUES ($1, $2, $3, $4, to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS'))
     ON CONFLICT (user_id) DO UPDATE SET
       period_minutes = EXCLUDED.period_minutes,
       visible_bars = EXCLUDED.visible_bars,
       items_json = EXCLUDED.items_json,
       updated_at = EXCLUDED.updated_at`,
    [userId, periodMinutes, visibleBars, itemsJson]
  );
}
