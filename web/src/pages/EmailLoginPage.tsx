import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, setAuthToken } from "../api";
import { storeCloudbaseSession } from "../cloudbase-session";
import type { AuthResponse } from "../types";

export function EmailLoginPage({ method: initialMethod = "email" }: { method?: "sms" | "email" }) {
  const [method, setMethod] = useState<"sms" | "email" | "password">(initialMethod);
  const [loginAccount, setLoginAccount] = useState(""); const [password, setPassword] = useState("");
  const sms = method === "sms"; const label = sms ? "手机号" : "邮箱";
  const [email, setEmail] = useState(""); const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState(""); const [remaining, setRemaining] = useState(0);
  const [mode, setMode] = useState<"login" | "link">("login");
  const [username, setUsername] = useState(""); const [legacyUsername, setLegacyUsername] = useState(""); const [legacyPassword, setLegacyPassword] = useState("");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [captcha,setCaptcha]=useState<{data:string;token:string}|null>(null);
  const [captchaAnswer,setCaptchaAnswer]=useState("");
  const version = useRef(0); const navigate = useNavigate(); const [params] = useSearchParams();
  useEffect(() => { if (remaining <= 0) return; const id = window.setTimeout(() => setRemaining(remaining - 1), 1000); return () => clearTimeout(id); }, [remaining]);
  function changeEmail(value: string) { version.current++; setEmail(value); setChallenge(""); setCode(""); setMessage("");setCaptcha(null);setCaptchaAnswer(""); }
  function changeMethod(value: typeof method) { if (busy) return; changeEmail(""); setMethod(value); setRemaining(0); setMode("login"); setPassword(""); setLegacyPassword(""); }
  async function sendCode() {
    const current = version.current; setBusy(true); setMessage(""); setChallenge("");
    try {
      let captchaToken:string|undefined;
      if(captcha){captchaToken=(await api.post<{captchaToken:string}>("/auth/captcha/verify",{token:captcha.token,key:captchaAnswer})).data.captchaToken;}
      const { data } = await api.post<{ challenge: string }>(`/auth/${method}/code`, {...(sms ? { phone: email } : { email }),...(captchaToken?{captchaToken}:{})});
      setCaptcha(null);setCaptchaAnswer("");
      if (version.current === current) { setChallenge(data.challenge); setRemaining(60); setMessage(sms ? "验证码已发送，请检查手机短信" : "验证码已发送，请检查邮箱和垃圾邮件文件夹"); }
    } catch (error: any) {
      if (version.current === current) {
        setMessage(error.response?.data?.message ?? "发送失败，请稍后重试");
        if(error.response?.data?.captchaRequired || captcha){
          try{const {data}=await api.post<{data:string;token:string}>("/auth/captcha",{});if(version.current===current){setCaptcha(data);setCaptchaAnswer("");}}
          catch{setMessage("无法加载图形验证码，请稍后重新获取");}
        }
      }
    }
    finally { setBusy(false); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if ((!challenge && method !== "password") || busy) return; setBusy(true); setMessage("");
    try {
      let captchaToken: string | undefined;
      if (method === "password" && captcha) captchaToken = (await api.post<{captchaToken:string}>("/auth/captcha/verify", {token:captcha.token,key:captchaAnswer})).data.captchaToken;
      const { data } = method === "password"
        ? await api.post<AuthResponse>("/auth/password/login", { username: loginAccount, password, ...(captchaToken ? {captchaToken} : {}) })
        : await api.post<AuthResponse>(`/auth/${method}/verify`, { challenge, code, ...(mode === "link" ? { legacyUsername, legacyPassword } : username ? { username } : {}) });
      storeCloudbaseSession(data); setAuthToken(data.token);
      navigate(params.get("next") === "/upload?createSpace=1" ? "/upload?createSpace=1" : "/upload");
    } catch (error: any) {
      setMessage(error.response?.data?.message ?? "登录失败，请稍后重试");
      if (method === "password" && (error.response?.data?.captchaRequired || captcha)) {
        try { setCaptcha((await api.post("/auth/captcha", {})).data); setCaptchaAnswer(""); }
        catch { setMessage("无法加载图形验证码，请稍后重试"); }
      }
    }
    finally { setBusy(false); }
  }
  return <section className="auth-page">
    <aside className="auth-intro">
      <div className="auth-brand"><img src="/logo.svg" alt=""/><span>Drop & Share</span></div>
      <h1>让作品，<br/>有一个去处。</h1>
      <p>把想法做成作品，把作品分享出去。<br/>管理你的作品与空间，从这里继续。</p>
      <div className="auth-illustration" aria-hidden="true">
        <div className="auth-preview-back"><span/><span/><span/></div>
        <div className="auth-preview-front"><div className="auth-preview-bar"><i/><i/><i/></div><div className="auth-preview-art"><svg viewBox="0 0 100 70"><path d="m16 49 22-28 18 18 15-22 17 32"/><circle cx="75" cy="16" r="5"/></svg></div><div className="auth-preview-caption"><span>我的作品</span><svg viewBox="0 0 24 24"><path d="M7 17 17 7M7 7h10v10"/></svg></div></div>
        <span className="auth-share-note">创作 · 分享 · 连接</span>
      </div>
    </aside>
    <div className="auth-card">
    <header className="auth-card-heading"><h2>登录 Drop & Share</h2><p>选择熟悉的方式，继续你的创作。</p></header>
    <div className="auth-method-switch" role="group" aria-label="登录方式">
      {([ ["sms", "手机验证码"], ["email", "邮箱验证码"], ["password", "账号密码"] ] as const).map(([value, text]) => <button key={value} type="button" aria-pressed={method === value} disabled={busy} onClick={() => changeMethod(value)}>{text}</button>)}
    </div>
    {method !== "password" && <><div className="auth-mode-switch" role="group" aria-label="登录或关联旧账号">
      <button type="button" aria-pressed={mode === "login"} onClick={() => setMode("login")}>登录 / 注册</button>
      <button type="button" aria-pressed={mode === "link"} onClick={() => setMode("link")}>关联旧账号</button>
    </div>
    <p className="auth-mode-note">{mode === "link" ? "验证原账号并绑定新登录身份，保留原有作品、空间和权限。" : "新用户验证后自动注册。已有作品？首次登录请选择“关联旧账号”。手机号与邮箱可在登录后的账号设置中绑定。"}</p></>}
    {method === "password" && <p className="auth-mode-note">使用 CloudBase 登录用户名、已绑定的手机号或邮箱及密码。首次使用或忘记密码？请先用验证码登录，在“账号设置”中设置密码。旧网站密码仅用于关联旧账号。</p>}
    <form className="auth-form" onSubmit={submit}>
      {method === "password" ? <>
        <label>登录账号<input autoComplete="username" required value={loginAccount} disabled={busy} onChange={e => setLoginAccount(e.target.value)} placeholder="登录用户名 / 手机号 / 邮箱" /></label>
        <label>登录密码<input type="password" autoComplete="current-password" required value={password} disabled={busy} onChange={e => setPassword(e.target.value)} /></label>
      </> : <label>{label}<input type={sms ? "tel" : "email"} autoComplete={sms ? "tel" : "email"} placeholder={sms ? "中国大陆手机号" : undefined} required value={email} disabled={busy} onChange={e => changeEmail(e.target.value)} /></label>}
      {captcha&&<div className="auth-captcha"><img src={captcha.data} alt="请识别图中的验证码"/><label>图形验证码<input autoComplete="off" maxLength={32} value={captchaAnswer} onChange={e=>setCaptchaAnswer(e.target.value)}/></label></div>}
      {method !== "password" && <><div className="auth-code-field"><label>验证码<input placeholder="输入 6 位验证码" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value)} /></label>
      <button className="auth-send-code" type="button" disabled={busy || remaining > 0 || !email || !!captcha&&!captchaAnswer} onClick={() => void sendCode()}>{remaining > 0 ? `${remaining} 秒后重发` : "获取验证码"}</button></div>
      {mode === "link" ? <>
        <label>原用户名<input autoComplete="username" required value={legacyUsername} onChange={e => setLegacyUsername(e.target.value)} /></label>
        <label>原密码<input type="password" autoComplete="current-password" required value={legacyPassword} onChange={e => setLegacyPassword(e.target.value)} /></label>
      </> : <label>新用户昵称（选填）<input autoComplete="nickname" minLength={3} maxLength={32} pattern="[a-zA-Z0-9_]+" placeholder="字母、数字或下划线，已有用户无需填写" value={username} onChange={e => setUsername(e.target.value)} /></label>}</>}
      <button className="auth-submit" type="submit" disabled={busy || (method === "password" ? !loginAccount || !password || !!captcha && !captchaAnswer : !challenge)}>{busy ? "请稍候…" : method === "password" ? "登录" : "验证并登录"}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></button>
    </form>
    <p className="message" role="status">{message}</p>
    </div>
  </section>;
}
