import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

export const dbPath = path.join(dataDir, "app.db");
export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS annotations (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    period_minutes INTEGER NOT NULL DEFAULT 15,
    items_json TEXT NOT NULL DEFAULT '[]',
    visible_bars INTEGER NOT NULL DEFAULT 80,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS market_cache (
    interval TEXT PRIMARY KEY,
    data_json TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );
`);

const annotationCols = db.prepare("PRAGMA table_info(annotations)").all();
if (!annotationCols.some((c) => c.name === "visible_bars")) {
  db.exec("ALTER TABLE annotations ADD COLUMN visible_bars INTEGER NOT NULL DEFAULT 80");
}
