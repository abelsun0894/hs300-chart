import type { Annotation, MarketBundle, User } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || "服务器响应无效" };
  }
  if (!res.ok) {
    const msg = (data as { error?: string })?.error || `请求失败 (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export const api = {
  me: () => request<{ user: User | null }>("/api/auth/me"),
  login: (email: string, password: string) =>
    request<{ user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (email: string, password: string) =>
    request<{ user: User }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  market: () => request<MarketBundle>("/api/market"),
  getAnnotations: () =>
    request<{ periodMinutes: number; visibleBars: number; items: Annotation[]; updatedAt: string | null }>("/api/annotations"),
  saveAnnotations: (periodMinutes: number, items: Annotation[], visibleBars: number) =>
    request<{ periodMinutes: number; visibleBars: number; items: Annotation[]; updatedAt: string | null }>("/api/annotations", {
      method: "PUT",
      body: JSON.stringify({ periodMinutes, items, visibleBars }),
    }),
};
