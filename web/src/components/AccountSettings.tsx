import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { getCurrentUser, notifyAuthChanged } from "../auth";
import { DashboardAccount, type Account, type AccountAction } from "./DashboardAccount";

import { UserAvatar } from "./UserAvatar";

type Method = "sms" | "email";
const actions: AccountAction[] = ["password", "nickname", "bind-email", "rebind-email"];
export function AccountSettings() {
  const location = useLocation(); const [params, setParams] = useSearchParams();
  const requested = params.get("action");
  const operation: AccountAction | null = actions.includes(requested as AccountAction) ? requested as AccountAction
    : params.get("bind") === "email" ? "bind-email"
    : location.hash === "#account-password" ? "password" : null;
  const [account, setAccount] = useState<Account | null>(null);
  const [method, setMethod] = useState<Method>("email");
  const [challenge, setChallenge] = useState(""); const [code, setCode] = useState(""); const [proof, setProof] = useState("");
  const [identity, setIdentity] = useState(""); const [contactChallenge, setContactChallenge] = useState(""); const [contactCode, setContactCode] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const [proofCooldown, setProofCooldown] = useState(0); const [contactCooldown, setContactCooldown] = useState(0);
  const [captcha, setCaptcha] = useState<{ data: string; token: string; purpose: "proof" | "contact" } | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const contactMethod: Method = operation?.endsWith("phone") ? "sms" : "email";
  const contactLabel = contactMethod === "sms" ? "手机号" : "邮箱";
  const binding = !!operation && (operation.startsWith("bind-") || operation.startsWith("rebind-"));
  const existingContact = contactMethod === "sms" ? account?.phone : account?.email;
  const ticking = proofCooldown > 0 || contactCooldown > 0;
  useEffect(() => {
    let active = true;
    api.get<Account>("/auth/account").then(({ data }) => {
      if (active) { setAccount(data); setNickname(data.username); setMethod("email"); }
    }).catch((failure: any) => { if (active) setError(failure.response?.data?.message || "账号资料加载失败，请重新打开账号设置"); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    setChallenge(""); setCode(""); setProof(""); setIdentity(""); setContactChallenge(""); setContactCode(""); setCaptcha(null); setCaptchaAnswer(""); setPassword(""); setConfirm("");
    if (operation) requestAnimationFrame(() => document.getElementById("account-operation")?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }));
  }, [operation]);
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => { setProofCooldown(n => Math.max(0, n - 1)); setContactCooldown(n => Math.max(0, n - 1)); }, 1000);
    return () => clearInterval(timer);
  }, [ticking]);
  useEffect(() => {
    if (!proof) return;
    const timer = setTimeout(() => { setProof(""); setChallenge(""); setCode(""); setContactChallenge(""); setError("身份验证已过期，请重新验证"); }, 9 * 60000);
    return () => clearTimeout(timer);
  }, [proof]);
  useEffect(() => {
    if (!avatarOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) closeAvatar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [avatarOpen, busy]);
  function choose(action: AccountAction | null) {
    if (busy) return; setError(""); setMessage(""); if (action === "nickname" && account) setNickname(account.username);
    setParams(current => { const next = new URLSearchParams(current); next.set("tab", "account"); next.delete("bind"); next.delete("action"); if (action) next.set("action", action); return next; });
  }
  async function refreshAccount() { const { data } = await api.get<Account>("/auth/account"); setAccount(data); setMethod("email"); }
  async function run(action: () => Promise<void>) {
    if (busy) return; setBusy(true); setError(""); setMessage("");
    try { await action(); } catch (failure: any) { setError(failure.response?.data?.message || "操作失败，请稍后重试"); }
    finally { setBusy(false); }
  }
  function finish(text: string) { setParams({ tab: "account" }); setMessage(text); }
  function closeAvatar() {
    if (busy) return;
    setAvatarOpen(false);
    setAvatarFile(null);
  }
  function openAvatar() {
    if (busy) return;
    setError("");
    setMessage("");
    setAvatarFile(null);
    setAvatarOpen(true);
  }
  async function saveAvatar() {
    if (!account || !avatarFile) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(avatarFile.type) || avatarFile.size > 2 * 1024 * 1024) {
      setError("请选择不超过 2 MiB 的 PNG、JPEG、WebP 或 GIF 图片");
      return;
    }
    await run(async () => {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("图片读取失败"));
        reader.readAsDataURL(avatarFile);
      });
      const response = await api.post<{ avatarUrl: string }>("/auth/account/avatar", { mimeType: avatarFile.type, data });
      setAccount({ ...account, avatarUrl: response.data.avatarUrl });
      const user = getCurrentUser();
      if (user) {
        localStorage.setItem("user", JSON.stringify({ ...user, avatarUrl: response.data.avatarUrl }));
        notifyAuthChanged();
      }
      setAvatarOpen(false);
      setAvatarFile(null);
      setMessage("头像已更新");
    });
  }
  async function send(purpose: "proof" | "contact") {
    await run(async () => {
      try {
        let captchaToken: string | undefined;
        if (captcha?.purpose === purpose) captchaToken = (await api.post("/auth/captcha/verify", { token: captcha.token, key: captchaAnswer })).data.captchaToken;
        const { data } = await api.post(`/auth/account/${purpose}/code`, { ...(purpose === "proof" ? { method } : { method: contactMethod, identity, proof }), ...(captchaToken ? { captchaToken } : {}) });
        if (purpose === "proof") { setChallenge(data.challenge); setProofCooldown(60); } else { setContactChallenge(data.challenge); setContactCooldown(60); }
        setCaptcha(null); setCaptchaAnswer(""); setMessage("验证码已发送，请查收");
      } catch (failure: any) {
        if (failure.response?.data?.captchaRequired || captcha?.purpose === purpose) { setCaptcha({ ...(await api.post("/auth/captcha", {})).data, purpose }); setCaptchaAnswer(""); }
        throw failure;
      }
    });
  }
  function captchaField(purpose: "proof" | "contact") { return captcha?.purpose === purpose && <div className="auth-captcha"><img src={captcha.data} alt="请识别图中的验证码" /><label>图形验证码<input value={captchaAnswer} onChange={event => setCaptchaAnswer(event.target.value)} /></label></div>; }
  const cooldown = (purpose: "proof" | "contact") => purpose === "proof" ? proofCooldown : contactCooldown;
  const sendDisabled = (purpose: "proof" | "contact") => busy || cooldown(purpose) > 0 || captcha?.purpose === purpose && !captchaAnswer;
  const feedback = <>{!avatarOpen && error && <p className="account-action-error" role="alert">{error}</p>}{!avatarOpen && message && <p className="message" role="status">{message}</p>}</>;
  const verification = <section className="account-section"><h3>验证当前身份</h3>{proof ? <p className="account-verified">身份已验证</p> : !account?.email ? <p>短信验证已停用。请先<Link to="/login?mode=migrate">关联旧账号并验证新邮箱</Link>，再修改账号资料。</p> : <form className="auth-form" onSubmit={event => {
    event.preventDefault(); void run(async () => { const { data } = await api.post("/auth/account/proof/verify", { challenge, code }); setProof(data.proof); setCode(""); setMessage("身份验证成功"); });
  }}>
    <label>验证方式<select value={method} disabled={busy} onChange={event => { setMethod(event.target.value as Method); setChallenge(""); setCode(""); setCaptcha(null); }}>
      {account?.email && <option value="email">已绑定邮箱</option>}
    </select></label>{captchaField("proof")}
    <div className="auth-code-field"><label>当前身份验证码<input required pattern="[0-9]{6}" maxLength={6} inputMode="numeric" autoComplete="one-time-code" value={code} disabled={busy} onChange={event => setCode(event.target.value)} /></label><button type="button" disabled={sendDisabled("proof")} onClick={() => void send("proof")}>{proofCooldown ? `${proofCooldown} 秒后重发` : "获取验证码"}</button></div>
    <button className="auth-submit" type="submit" disabled={busy || !challenge}>验证身份</button>
  </form>}</section>;
  return <section className="account-settings-panel" aria-label="账号设置"><h2>账号设置</h2>
    {feedback}
    {account && <div className="account-avatar">
      <UserAvatar username={account.username} avatarUrl={account.avatarUrl} label="当前头像" />
      <button type="button" className="account-field-action" aria-label="修改头像" title="修改头像" disabled={busy} onClick={openAvatar}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L20 8l-4-4L4 16v4ZM13 7l4 4" /></svg>
      </button>
    </div>}
    {avatarOpen && account && createPortal(
      <div className="modal-overlay" onClick={event => { if (event.target === event.currentTarget) closeAvatar(); }}>
        <div className="modal-card account-avatar-dialog" role="dialog" aria-modal="true" aria-labelledby="account-avatar-title">
          <h3 id="account-avatar-title">修改头像</h3>
          <form className="account-avatar-form" onSubmit={event => { event.preventDefault(); void saveAvatar(); }}>
            <UserAvatar username={account.username} avatarUrl={account.avatarUrl} label="当前头像" />
            <label className="account-avatar-file">选择头像<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy} onChange={event => setAvatarFile(event.target.files?.[0] ?? null)} /></label>
            {avatarFile && <p className="account-avatar-filename">{avatarFile.name}</p>}
            <p className="hint">PNG、JPEG、WebP 或 GIF，最大 2 MiB</p>
            {error && <p className="account-action-error" role="alert">{error}</p>}
            <div className="account-avatar-actions">
              <button type="button" disabled={busy} onClick={closeAvatar}>取消</button>
              <button type="submit" disabled={busy || !avatarFile}>保存头像</button>
            </div>
          </form>
        </div>
      </div>,
      document.body
    )}
    {account && <DashboardAccount account={account} onAction={choose} disabled={busy} />}
    {account && operation && <section className="account-operation" id="account-operation">
      <div className="account-operation-heading"><h3>{operation === "password" ? "修改密码" : operation === "nickname" ? "修改昵称" : `${existingContact ? "重新绑定" : "绑定"}${contactLabel}`}</h3><button type="button" disabled={busy} onClick={() => choose(null)}>收起</button></div>
      {operation !== "nickname" && verification}
      {operation === "nickname" && <form className="auth-form" onSubmit={event => { event.preventDefault(); void run(async () => {
        const { data } = await api.post<{ username: string }>("/auth/account/nickname", { nickname }); setAccount({ ...account, username: data.username });
        const user = getCurrentUser(); if (user) { localStorage.setItem("user", JSON.stringify({ ...user, username: data.username })); notifyAuthChanged(); }
        finish("昵称已修改");
      }); }}><label>新昵称<input required minLength={2} maxLength={32} value={nickname} disabled={busy} onChange={event => setNickname(event.target.value)} /></label><button type="submit" disabled={busy || !nickname.trim()}>保存昵称</button></form>}
      {binding && <form className="auth-form" onSubmit={event => { event.preventDefault(); void run(async () => {
        await api.post("/auth/account/contact/verify", { proof, challenge: contactChallenge, code: contactCode }); await refreshAccount(); finish(`${contactLabel}绑定成功`);
      }); }}><p className="hint">{existingContact ? "新方式验证完成前保留当前绑定。" : "已有其他账号使用的手机号或邮箱不能直接绑定。"}</p>
        <label>{`新${contactLabel}`}<input type={contactMethod === "email" ? "email" : "tel"} required disabled={busy || !proof} value={identity} onChange={event => { setIdentity(event.target.value); setContactChallenge(""); setContactCode(""); setCaptcha(null); }} /></label>{captchaField("contact")}
        <div className="auth-code-field"><label>新登录方式验证码<input required pattern="[0-9]{6}" maxLength={6} inputMode="numeric" autoComplete="one-time-code" value={contactCode} disabled={busy || !proof} onChange={event => setContactCode(event.target.value)} /></label><button type="button" disabled={sendDisabled("contact") || !proof || !identity} onClick={() => void send("contact")}>{contactCooldown ? `${contactCooldown} 秒后重发` : "获取验证码"}</button></div>
        <button type="submit" disabled={busy || !proof || !contactChallenge}>确认绑定</button>
      </form>}
      {operation === "password" && <><form className="auth-form" onSubmit={event => { event.preventDefault(); if (password !== confirm) { setError("两次输入的密码不一致"); return; } void run(async () => {
        await api.post("/auth/account/password", { proof, password }); finish("密码已修改");
      }); }}><label>新密码<input type="password" required minLength={8} maxLength={64} pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).+" autoComplete="new-password" value={password} disabled={busy || !proof} onChange={event => setPassword(event.target.value)} /></label><p className="hint">8–64 位，包含大小写字母、数字和特殊字符。</p><label>确认新密码<input type="password" required autoComplete="new-password" value={confirm} disabled={busy || !proof} onChange={event => setConfirm(event.target.value)} /></label><button type="submit" disabled={busy || !proof}>保存新密码</button></form>
      </>}
    </section>}

  </section>;
}
