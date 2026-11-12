import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..", "..");
dotenv.config({ path: path.join(rootDir, ".env") });

// 本地 HTTP 开发必须用非 Secure cookie，否则浏览器不会保存登录态
if (process.env.COOKIE_SECURE === undefined && process.env.NODE_ENV !== "production") {
  process.env.COOKIE_SECURE = "0";
}

await import("./db.js");
const { initStore, storageKind } = await import("./store.js");
await initStore();
const {
  authMiddleware,
  optionalAuth,
  normalizeEmail,
  validateCredentials,
  registerUser,
  loginUser,
  signUser,
  setAuthCookie,
  clearAuthCookie,
} = await import("./auth.js");
const { getAnnotations, saveAnnotations } = await import("./annotations.js");
const { getAllMarketData, getMarketBars } = await import("./market.js");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const clientDist = path.join(rootDir, "client", "dist");

const defaultOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];
const extraOrigin = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const allowOrigins = new Set([...defaultOrigins, ...extraOrigin]);

app.set("trust proxy", 1);
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowOrigins.has(origin)) return cb(null, true);
      // 允许同局域网 IP 访问开发服务（手机连电脑调试）
      if (/^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+):\d+$/.test(origin)) {
        return cb(null, true);
      }
      cb(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "沪深300 K线" });
});

app.post("/api/auth/register", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  const errMsg = validateCredentials(email, password);
  if (errMsg) return res.status(400).json({ error: errMsg });
  try {
    const user = await registerUser(email, password);
    const token = signUser(user);
    setAuthCookie(res, token);
    res.status(201).json({ user });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "注册失败" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  if (!email || !password) return res.status(400).json({ error: "请输入邮箱和密码" });
  try {
    const user = await loginUser(email, password);
    const token = signUser(user);
    setAuthCookie(res, token);
    res.json({ user });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "登录失败" });
  }
});

app.post("/api/auth/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get("/api/auth/me", optionalAuth, (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: req.user });
});

app.get("/api/market", async (_req, res) => {
  try {
    const data = await getAllMarketData();
    res.json(data);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message || "行情获取失败" });
  }
});

app.get("/api/market/:interval", async (req, res) => {
  const interval = req.params.interval;
  if (!["1m", "5m", "60m", "1d"].includes(interval)) {
    return res.status(400).json({ error: "interval 只能是 1m / 5m / 60m / 1d" });
  }
  try {
    const force = req.query.refresh === "1";
    const data = await getMarketBars(interval, { force });
    res.json({ interval, ...data });
  } catch (err) {
    res.status(502).json({ error: err.message || "行情获取失败" });
  }
});

app.get("/api/annotations", authMiddleware, async (req, res) => {
  try {
    res.json(await getAnnotations(req.user.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "服务器错误" });
  }
});

app.put("/api/annotations", authMiddleware, async (req, res) => {
  try {
    const saved = await saveAnnotations(req.user.id, req.body);
    res.json(saved);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "保存失败" });
  }
});

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "服务器错误" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`沪深300 K线服务已启动: http://127.0.0.1:${PORT}（存储: ${storageKind}）`);
});
