"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api, ApiError } from "../lib/api";
import { AdminPoints } from "./points";
import { AdminActivities } from "./admin-activities";
import { AdminRewards } from "./rewards";
import { AdminMessages } from "./messages";
import { AdminAssets } from "./assets";
import type { User } from "./activity-shared";

const navigation = [
  ["overview", "运营概览"], ["activities", "活动管理"], ["slots", "场次与名额"],
  ["bookings", "预约与签到"], ["points", "积分管理"], ["rewards", "权益管理"],
  ["redemptions", "兑换订单"], ["reports", "社区审核"], ["messages", "运营消息"],
  ["assets", "素材管理"],
];
const labels: Record<string, string> = {
  totalAvailablePoints: "可用积分总量", publishedActivities: "已发布活动",
  confirmedBookings: "待参加预约", publishedRewards: "已发布权益",
  pendingRedemptions: "待履约订单", openReports: "待处理举报",
  sentCampaigns: "已发送消息批次", unreadNotifications: "站内未读通知",
};
export function Platform() {
  const path = usePathname();
  const route = path.split("/")[1] || "overview";
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const sequence = useRef(0);
  async function refresh() {
    const current = ++sequence.current;
    setReady(false); setUser(null); setForbidden(false); setError("");
    try {
      const session = await api<User>("/api/v1/me/m05-session");
      if (current !== sequence.current) return;
      if (!session.roles.includes("admin")) {
        // Ask the protected endpoint so the displayed denial comes from the server.
        await api("/api/v1/admin/overview");
        throw new ApiError(403, "ADMIN_REQUIRED", "当前账号没有管理权限");
      }
      setUser(session); setRevision(v => v + 1);
    } catch (e) {
      if (current !== sequence.current) return;
      if (e instanceof ApiError && e.status === 403) setForbidden(true);
      if (!(e instanceof ApiError && e.status === 401)) setError((e as Error).message);
    } finally { if (current === sequence.current) setReady(true); }
  }
  useEffect(() => {
    void refresh();
    const expired = () => { ++sequence.current; setUser(null); setReady(true); };
    const focus = () => void refresh();
    window.addEventListener("auth-expired", expired);
    window.addEventListener("focus", focus);
    return () => { ++sequence.current; window.removeEventListener("auth-expired", expired); window.removeEventListener("focus", focus); };
  }, []);
  async function logout() {
    try { await api("/api/v1/auth/logout", { method: "POST", body: "{}" }); await refresh(); }
    catch (e) { setError((e as Error).message); }
  }
  const title = navigation.find(([key]) => key === route)?.[1] || "页面未找到";
  return <div className="platform admin">
    <aside className="sidebar"><Link className="brand" href="/overview">轻养 · 运营后台</Link>
      <nav>{navigation.map(([key, label]) => <Link key={key} href={"/" + key} className={route === key ? "active" : ""}>{label}</Link>)}</nav>
    </aside>
    <div className="workspace"><header><b>{title}</b><div className="header-actions">
      {user && <><span>{user.nickname}</span><button className="button secondary" onClick={() => void logout()}>退出登录</button></>}
      <button className="button secondary" onClick={() => void refresh()}>刷新</button>
    </div></header><main>
      {error && <p role="alert" className="alert">{error}</p>}
      {!ready ? <p role="status">正在恢复会话…</p> : forbidden ? <section className="card"><h1>403 · 无管理权限</h1><p>此账号没有后台权限，请联系项目管理员。</p><button className="button secondary" onClick={() => void logout()}>退出登录</button></section> : !user ? <EmailLogin done={refresh} /> : <div key={user.id + revision}>
        {route === "overview" ? <Overview /> : route === "points" ? <AdminPoints user={user} refreshVersion={revision} /> : ["activities", "slots", "bookings", "reports"].includes(route) ? <AdminActivities user={user} route={route} refreshVersion={revision} /> : ["rewards", "redemptions"].includes(route) ? <AdminRewards user={user} path={path} refreshVersion={revision} /> : route === "messages" ? <AdminMessages user={user} path={path} refreshVersion={revision} /> : route === "assets" ? <AdminAssets user={user} /> : <h1>页面未找到</h1>}
      </div>}
    </main></div>
  </div>;
}
function EmailLogin({ done }: { done: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState("");
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const attempt = useRef({ signature: "", key: "" });
  const device = useRef("");
  async function send() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api<{ challengeId: string; resendAfterSeconds: number }>("/api/v1/auth/email-codes", { method: "POST", body: JSON.stringify({ email: email.trim(), purpose: "login" }) });
      setChallenge(result.challengeId); setCode(""); setUntil(Date.now() + result.resendAfterSeconds * 1000); setNotice("验证码已发送，请查看邮箱。");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function login(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      device.current ||= crypto.randomUUID();
      const body = JSON.stringify({ challengeId: challenge, code, deviceId: device.current, platform: "h5" });
      if (attempt.current.signature !== body) attempt.current = { signature: body, key: crypto.randomUUID() };
      await api("/api/v1/auth/login", { method: "POST", body, headers: { "Idempotency-Key": attempt.current.key } });
      await done();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="card login-card"><h1>登录运营后台</h1><p>使用已获授权的邮箱账号登录。</p><form onSubmit={login}>
    <label className="field">邮箱<input type="email" required value={email} onChange={e => { setEmail(e.target.value); setChallenge(""); }} /></label>
    <button type="button" className="button secondary" disabled={busy || !email || now < until} onClick={() => void send()}>发送验证码（请间隔一分钟重试）</button>
    <label className="field">验证码<input required inputMode="numeric" value={code} onChange={e => setCode(e.target.value)} /></label>
    <button className="button" disabled={busy || !challenge || !code}>登录</button>
  </form>{error && <p role="alert" className="alert">{error}</p>}{notice && <p role="status">{notice}</p>}</section>;
}
function Overview() {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; Promise.all([api<Record<string, number>>("/api/v1/admin/overview"), api("/api/v1/admin/overview/runtime")]).then(([data]) => { if (active) setCounts(data); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  return <><h1>运营概览</h1>{error && <p role="alert" className="alert">{error}</p>}<div className="stat-grid">{Object.entries(labels).map(([key, label]) => <section className="card stat" key={key}><p>{label}</p><strong>{counts?.[key] ?? "—"}</strong></section>)}</div></>;
}
