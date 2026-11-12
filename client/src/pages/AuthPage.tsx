import { useState, type FormEvent } from "react";
import { api } from "../api";
import type { User } from "../types";

export default function AuthPage({ onAuthed }: { onAuthed: (u: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const fn = mode === "login" ? api.login : api.register;
      const r = await fn(email, password);
      onAuthed(r.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1>沪深300 K线</h1>
        <p className="lead">电脑和 iPhone 登录同一账号后，画线和方框会自动同步。</p>
        {error ? <div className="auth-error">{error}</div> : null}
        <div className="field">
          <label htmlFor="email">邮箱</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div className="field">
          <label htmlFor="password">密码</label>
          <input
            id="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 6 位"
          />
        </div>
        <div className="auth-actions">
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? "请稍候…" : mode === "login" ? "登录" : "注册"}
          </button>
        </div>
        <div className="switch">
          {mode === "login" ? (
            <>
              还没有账号？
              <button type="button" onClick={() => { setMode("register"); setError(""); }}>
                去注册
              </button>
            </>
          ) : (
            <>
              已有账号？
              <button type="button" onClick={() => { setMode("login"); setError(""); }}>
                去登录
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
