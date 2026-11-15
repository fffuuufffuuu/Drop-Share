import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, setAuthToken } from "../api";
import { hasCloudbaseSession, storeCloudbaseSession } from "../cloudbase-session";
import type { AuthResponse } from "../types";
import { getLoginDestination } from "../auth";

type Mode = "login" | "register" | "migrate";
const passwordPattern = "(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).+";
export function EmailLoginPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get("mode");
  const mode: Mode = requested === "register" ? "register" : requested === "migrate" || requested === "link" ? "migrate" : "login";
  const [loginAccount, setLoginAccount] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [proofMethod, setProofMethod] = useState<"session" | "recovery">(hasCloudbaseSession() ? "session" : "recovery");
  const [recoveryToken, setRecoveryToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [captcha, setCaptcha] = useState<{ data: string; token: string } | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const version = useRef(0);
  const navigate = useNavigate();
  useEffect(() => {
    version.current++;
    setChallenge(""); setCode(""); setPassword(""); setConfirmPassword(""); setMessage(""); setCaptcha(null); setCaptchaAnswer("");
    return () => { version.current++; };
  }, [mode]);
  useEffect(() => {
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setRemaining(value => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);
  function invalidate() {
    version.current++; setChallenge(""); setCode(""); setMessage(""); setCaptcha(null); setCaptchaAnswer("");
  }
  function changeMode(value: Mode) {
    if (busy) return;
    setParams(current => { const next = new URLSearchParams(current); next.set("mode", value); return next; });
  }
  async function captchaToken() {
    if (!captcha) return undefined;
    return (await api.post<{ captchaToken: string }>("/auth/captcha/verify", { token: captcha.token, key: captchaAnswer })).data.captchaToken;
  }
  async function failure(error: any, current: number, fallback: string) {
    if (version.current !== current) return;
    setMessage(error.response?.data?.message ?? fallback);
    if (error.response?.data?.captchaRequired || captcha) {
      try {
        const { data } = await api.post<{ data: string; token: string }>("/auth/captcha", {});
        if (version.current === current) { setCaptcha(data); setCaptchaAnswer(""); }
      } catch { if (version.current === current) setMessage("无法加载图形验证码，请稍后重试"); }
    }
  }
  async function sendCode() {
    if (busy || remaining > 0) return;
    const current = version.current;
    setBusy(true); setMessage(""); setChallenge("");
    try {
      const human = await captchaToken();
      const payload = { email, ...(mode === "migrate" ? { phone, ...(proofMethod === "recovery" ? { recoveryToken } : {}) } : {}), ...(human ? { captchaToken: human } : {}) };
      const { data } = await api.post<{ challenge: string }>(mode === "migrate" ? "/auth/migration/code" : "/auth/email/code", payload);
      if (version.current === current) { setChallenge(data.challenge); setRemaining(60); setCaptcha(null); setCaptchaAnswer(""); setMessage("验证码已发送，请检查邮箱和垃圾邮件文件夹"); }
    } catch (error) { await failure(error, current, "发送失败，请稍后重试"); }
    finally { setBusy(false); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || mode !== "login" && !challenge) return;
    if (mode !== "login" && password !== confirmPassword) { setMessage("两次输入的密码不一致"); return; }
    const current = version.current;
    setBusy(true); setMessage("");
    try {
      const human = mode === "login" ? await captchaToken() : undefined;
      const { data } = await api.post<AuthResponse>(mode === "login" ? "/auth/password/login" : mode === "register" ? "/auth/email/verify" : "/auth/migration/verify", mode === "login"
        ? { username: loginAccount, password, ...(human ? { captchaToken: human } : {}) }
        : { challenge, code, username, password });
      if (version.current !== current) return;
      storeCloudbaseSession(data); setAuthToken(data.token);
      navigate(getLoginDestination(params.get("next")));
    } catch (error) { await failure(error, current, mode === "migrate" ? "关联未完成，请稍后重试或联系管理员" : mode === "register" ? "注册失败，请稍后重试" : "登录失败，请稍后重试"); }
    finally { setBusy(false); }
  }
  const heading = mode === "login" ? "登录 Drop & Share" : mode === "register" ? "注册 Drop & Share" : "关联旧账号";
  return <section className="auth-page">
    <aside className="auth-intro">
      <div className="auth-brand"><img src="/logo.svg" alt="" /><span>Drop & Share</span></div>
      <h1>让作品，<br />有一个去处。</h1>
      <p>把想法做成作品，把作品分享出去。<br />管理你的作品与空间，从这里继续。</p>
      <div className="auth-illustration" aria-hidden="true">
        <div className="auth-preview-back"><span /><span /><span /></div>
        <div className="auth-preview-front"><div className="auth-preview-bar"><i /><i /><i /></div><div className="auth-preview-art"><svg viewBox="0 0 100 70"><path d="m16 49 22-28 18 18 15-22 17 32" /><circle cx="75" cy="16" r="5" /></svg></div><div className="auth-preview-caption"><span>我的作品</span><svg viewBox="0 0 24 24"><path d="M7 17 17 7M7 7h10v10" /></svg></div></div>
        <span className="auth-share-note">创作 · 分享 · 连接</span>
      </div>
    </aside>
    <div className="auth-card">
      <header className="auth-card-heading"><h2>{heading}</h2><p>{mode === "login" ? "使用用户名或邮箱和密码，继续你的创作。" : mode === "register" ? "验证邮箱并设置用户名和密码。" : "为原来的手机号账号设置新的登录方式，保留作品与空间。"}</p></header>
      <div className="auth-method-switch" role="group" aria-label="登录或注册">
        {([["login", "密码登录"], ["register", "邮箱注册"], ["migrate", "关联旧账号"]] as const).map(([value, text]) => <button key={value} type="button" aria-pressed={mode === value} disabled={busy} onClick={() => changeMode(value)}>{text}</button>)}
      </div>
      <form className="auth-form" onSubmit={submit}>
        {mode === "login" ? <label>用户名/邮箱<input autoComplete="username" required maxLength={254} value={loginAccount} disabled={busy} onChange={event => setLoginAccount(event.target.value)} placeholder="用户名或邮箱" /></label> : <>
          {mode === "migrate" && <>
            <label>原手机号<input type="tel" autoComplete="tel" required value={phone} disabled={busy} onChange={event => { setPhone(event.target.value); invalidate(); }} placeholder="原账号使用的中国大陆手机号" /></label>
            <label>原账号验证方式<select value={proofMethod} disabled={busy} onChange={event => { setProofMethod(event.target.value as "session" | "recovery"); invalidate(); }}>
              <option value="recovery">管理员核实后的迁移码</option><option value="session">原账号仍处于登录状态</option>
            </select></label>
            {proofMethod === "recovery" ? <><label>迁移码<textarea required autoComplete="off" value={recoveryToken} disabled={busy} onChange={event => { setRecoveryToken(event.target.value.trim()); invalidate(); }} /></label><p className="hint">无法收短信时，请先联系网站管理员核实原账号身份并领取迁移码。迁移码 15 分钟有效，仅能用于指定手机号和新邮箱。</p></> : <p className="hint">请在原来已登录的浏览器中操作。登录已失效时，请改用管理员发放的迁移码。</p>}
          </>}
          <label>{mode === "migrate" ? "新邮箱" : "邮箱"}<input type="email" autoComplete="email" required maxLength={254} value={email} disabled={busy} onChange={event => { setEmail(event.target.value); invalidate(); }} /></label>
          <label>{mode === "migrate" ? "新用户名" : "用户名"}<input required autoComplete="username" pattern="[A-Za-z0-9][A-Za-z0-9_.\-]{4,23}" minLength={5} maxLength={24} value={username} disabled={busy} onChange={event => setUsername(event.target.value)} /></label>
          <p className="hint">用户名为 5–24 位字母、数字、下划线、点或短横线，以字母或数字开头；注册后可单独设置中文昵称。</p>
        </>}
        <label>{mode === "login" ? "登录密码" : "设置密码"}<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "login" ? 1 : 8} maxLength={mode === "login" ? 100 : 64} pattern={mode === "login" ? undefined : passwordPattern} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /></label>
        {mode !== "login" && <><p className="hint">密码为 8–64 位，包含大小写字母、数字和特殊字符。</p><label>确认密码<input type="password" autoComplete="new-password" required value={confirmPassword} disabled={busy} onChange={event => setConfirmPassword(event.target.value)} /></label></>}
        {captcha && <div className="auth-captcha"><img src={captcha.data} alt="请识别图中的验证码" /><label>图形验证码<input autoComplete="off" maxLength={32} value={captchaAnswer} disabled={busy} onChange={event => setCaptchaAnswer(event.target.value)} /></label></div>}
        {mode !== "login" && <div className="auth-code-field"><label>邮箱验证码<input required pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" inputMode="numeric" value={code} disabled={busy} onChange={event => setCode(event.target.value)} /></label><button type="button" disabled={busy || remaining > 0 || !email || !!captcha && !captchaAnswer || mode === "migrate" && (!phone || proofMethod === "recovery" && !recoveryToken)} onClick={() => void sendCode()}>{remaining > 0 ? `${remaining} 秒后重发` : "获取验证码"}</button></div>}
        <button className="auth-submit" type="submit" disabled={busy || mode !== "login" && !challenge || mode === "login" && (!loginAccount || !password || !!captcha && !captchaAnswer)}>{busy ? "请稍候…" : mode === "login" ? "登录" : mode === "register" ? "注册并登录" : "关联并登录"}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg></button>
      </form>
      <p className="message" role="status">{message}</p>
    </div>
  </section>;
}
