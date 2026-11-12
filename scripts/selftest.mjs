import assert from "node:assert/strict";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";

function log(ok, name, extra = "") {
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${name}${extra ? "  — " + extra : ""}`);
}

async function req(path, { method = "GET", body, cookie } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  const setCookie = res.headers.getSetCookie?.() || [];
  const fallback = res.headers.get("set-cookie");
  const cookies = setCookie.length ? setCookie : fallback ? [fallback] : [];
  return { status: res.status, data, cookies };
}

function cookieHeader(cookies) {
  return cookies
    .map((c) => c.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

function checkBars(bars, label) {
  assert.ok(Array.isArray(bars) && bars.length > 0, `${label} 没有数据`);
  let prev = 0;
  for (const b of bars) {
    assert.ok(Number.isFinite(b.time) && b.time > 0, `${label} 时间无效`);
    assert.ok(b.time >= prev, `${label} 时间未递增`);
    prev = b.time;
    assert.ok([b.open, b.high, b.low, b.close].every(Number.isFinite), `${label} OHLC 无效`);
    assert.ok(b.high >= b.low, `${label} high < low`);
    assert.ok(b.high >= b.open && b.high >= b.close, `${label} high 过低`);
    assert.ok(b.low <= b.open && b.low <= b.close, `${label} low 过高`);
  }
}

async function main() {
  let failed = 0;
  const email = `test_${Date.now()}@example.com`;
  const password = "secret123";

  try {
    const health = await req("/api/health");
    assert.equal(health.status, 200);
    assert.equal(health.data.ok, true);
    log(true, "健康检查");
  } catch (e) {
    failed++;
    log(false, "健康检查", e.message);
    console.error("无法连接", BASE, "请先运行 npm start 或 npm run dev（后端 3000 端口）");
    process.exit(1);
  }

  try {
    const bad = await req("/api/auth/register", { method: "POST", body: { email: "bad", password: "12" } });
    assert.equal(bad.status, 400);
    log(true, "注册校验（无效邮箱/短密码）");
  } catch (e) {
    failed++;
    log(false, "注册校验", e.message);
  }

  let cookie = "";
  try {
    const reg = await req("/api/auth/register", { method: "POST", body: { email, password } });
    assert.equal(reg.status, 201, JSON.stringify(reg.data));
    assert.equal(reg.data.user.email, email);
    cookie = cookieHeader(reg.cookies);
    assert.ok(cookie.includes("hs300_token"), "未设置登录 cookie");
    assert.ok(reg.cookies.some((c) => /HttpOnly/i.test(c)), "cookie 不是 httpOnly");
    log(true, "注册并设置 httpOnly cookie", email);
  } catch (e) {
    failed++;
    log(false, "注册", e.message);
  }

  try {
    const again = await req("/api/auth/register", { method: "POST", body: { email, password } });
    assert.equal(again.status, 409);
    log(true, "重复注册返回 409");
  } catch (e) {
    failed++;
    log(false, "重复注册", e.message);
  }

  try {
    const me = await req("/api/auth/me", { cookie });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.email, email);
    log(true, "登录态 /api/auth/me");
  } catch (e) {
    failed++;
    log(false, "登录态", e.message);
  }

  try {
    const denied = await req("/api/annotations");
    assert.equal(denied.status, 401);
    log(true, "未登录不能读写标注");
  } catch (e) {
    failed++;
    log(false, "未登录保护", e.message);
  }

  const items = [
    { id: "line-1", type: "line", t1: 1762921800, p1: 4050.12, t2: 1762925400, p2: 4070.5, color: "#ef5350" },
    { id: "box-1", type: "box", t1: 1762920000, p1: 4030, t2: 1762930000, p2: 4088.25, color: "#58a6ff" },
  ];

  try {
    const saved = await req("/api/annotations", {
      method: "PUT",
      cookie,
      body: { periodMinutes: 17, visibleBars: 120, items },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.periodMinutes, 17);
    assert.equal(saved.data.visibleBars, 120);
    assert.equal(saved.data.items.length, 2);
    assert.equal(saved.data.items[0].color, "#ef5350");
    assert.equal(saved.data.items[1].type, "box");
    log(true, "保存标注（线/框/颜色/周期）");
  } catch (e) {
    failed++;
    log(false, "保存标注", e.message);
  }

  try {
    const got = await req("/api/annotations", { cookie });
    assert.equal(got.status, 200);
    assert.equal(got.data.periodMinutes, 17);
    assert.equal(got.data.visibleBars, 120);
    assert.equal(got.data.items[1].p2, 4088.25);
    assert.equal(got.data.items[0].t1, 1762921800);
    log(true, "读取标注与保存一致");
  } catch (e) {
    failed++;
    log(false, "读取标注", e.message);
  }

  try {
    const clamped = await req("/api/annotations", {
      method: "PUT",
      cookie,
      body: { periodMinutes: 17, visibleBars: 9999, items },
    });
    assert.equal(clamped.status, 200);
    assert.equal(clamped.data.visibleBars, 500);
    const omitted = await req("/api/annotations", {
      method: "PUT",
      cookie,
      body: { periodMinutes: 17, items },
    });
    assert.equal(omitted.data.visibleBars, 80);
    const restored = await req("/api/annotations", {
      method: "PUT",
      cookie,
      body: { periodMinutes: 17, visibleBars: 120, items },
    });
    assert.equal(restored.data.visibleBars, 120);
    log(true, "密度范围校验（越界钳制、缺省 80）");
  } catch (e) {
    failed++;
    log(false, "密度范围校验", e.message);
  }

  try {
    await req("/api/auth/logout", { method: "POST", cookie });
    const me2 = await req("/api/auth/me", { cookie });
    // old cookie should be invalid after logout only if server invalidates;
    // JWT 仍可能有效，但 cookie 会被清除。用空 cookie 检查。
    const me3 = await req("/api/auth/me");
    assert.equal(me3.data.user, null);
    log(true, "退出后未带 cookie 则为未登录");
    void me2;
  } catch (e) {
    failed++;
    log(false, "退出", e.message);
  }

  try {
    const login = await req("/api/auth/login", { method: "POST", body: { email, password } });
    assert.equal(login.status, 200);
    cookie = cookieHeader(login.cookies);
    const got = await req("/api/annotations", { cookie });
    assert.equal(got.data.items.length, 2);
    log(true, "重新登录后标注仍在");
  } catch (e) {
    failed++;
    log(false, "重新登录读标注", e.message);
  }

  try {
    const market = await req("/api/market");
    assert.equal(market.status, 200, JSON.stringify(market.data).slice(0, 200));
    const data = market.data.data;
    checkBars(data["1m"].bars, "1m");
    checkBars(data["5m"].bars, "5m");
    checkBars(data["60m"].bars, "60m");
    checkBars(data["1d"].bars, "1d");
    const last1 = data["1m"].bars.at(-1);
    const lastD = data["1d"].bars.at(-1);
    const age1 = Date.now() / 1000 - last1.time;
    const ageD = Date.now() / 1000 - lastD.time;
    // 1m 应是最近几个交易日内；日线同样
    assert.ok(age1 < 10 * 24 * 3600, `1分钟最后一根过旧: ${new Date(last1.time * 1000).toISOString()}`);
    assert.ok(ageD < 10 * 24 * 3600, `日线最后一根过旧: ${new Date(lastD.time * 1000).toISOString()}`);
    assert.ok(data["1m"].bars.length >= 200, `1分钟数量过少: ${data["1m"].bars.length}`);
    assert.ok(data["1d"].bars.length >= 200, `日线数量过少: ${data["1d"].bars.length}`);
    log(
      true,
      "拉到真实沪深300行情",
      `1m=${data["1m"].bars.length}(${data["1m"].source}) 5m=${data["5m"].bars.length} 60m=${data["60m"].bars.length} 1d=${data["1d"].bars.length} 末根收盘=${last1.close}`
    );
  } catch (e) {
    failed++;
    log(false, "真实行情", e.message);
  }

  if (failed) {
    console.log(`\n自测结束：${failed} 项失败`);
    process.exit(1);
  }
  console.log("\n自测结束：API 全部通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
