import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { findUserById, findUserByEmail, insertUser } from "./store.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOKIE_NAME = "hs300_token";

function jwtSecret() {
  return process.env.JWT_SECRET || "dev-insecure-secret-change-me";
}

function sessionDays() {
  const n = Number(process.env.SESSION_DAYS || 30);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

export function cookieOptions() {
  const days = sessionDays();
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "1",
    path: "/",
    maxAge: days * 24 * 60 * 60 * 1000,
  };
}

export function signUser(user) {
  return jwt.sign(
    { uid: user.id, email: user.email },
    jwtSecret(),
    { expiresIn: `${sessionDays()}d` }
  );
}

export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: 0 });
}

export async function authMiddleware(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: "请先登录" });
  }
  let row;
  try {
    const payload = jwt.verify(token, jwtSecret());
    row = await findUserById(payload.uid);
  } catch {
    return res.status(401).json({ error: "登录已失效" });
  }
  if (!row) return res.status(401).json({ error: "登录已失效" });
  req.user = { id: row.id, email: row.email };
  next();
}

export async function optionalAuth(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next();
  try {
    const payload = jwt.verify(token, jwtSecret());
    const row = await findUserById(payload.uid);
    if (row) req.user = { id: row.id, email: row.email };
  } catch {
    // ignore
  }
  next();
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function validateCredentials(email, password) {
  if (!EMAIL_RE.test(email)) return "请输入有效的邮箱地址";
  if (typeof password !== "string" || password.length < 6) {
    return "密码至少 6 位";
  }
  if (password.length > 72) return "密码过长";
  return null;
}

export async function registerUser(email, password) {
  const hash = bcrypt.hashSync(password, 10);
  const id = await insertUser(email, hash);
  return { id, email };
}

export async function loginUser(email, password) {
  const row = await findUserByEmail(email);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    const e = new Error("邮箱或密码不正确");
    e.status = 401;
    throw e;
  }
  return { id: row.id, email: row.email };
}
