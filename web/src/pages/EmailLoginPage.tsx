import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, setAuthToken } from "../api";
import { storeCloudbaseSession } from "../cloudbase-session";
import type { AuthResponse } from "../types";
import { getLoginDestination } from "../auth";

export function EmailLoginPage({ method: initialMethod = "email" }: { method?: "sms" | "email" }) {
  const [method, setMethod] = useState<"sms" | "email" | "password">(initialMethod);
  const [loginAccount, setLoginAccount] = useState(""); const [password, setPassword] = useState("");
  const sms = method === "sms"; const label = sms ? "手机号" : "邮箱";
  const [email, setEmail] = useState(""); const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState(""); const [remaining, setRemaining] = useState(0);
  const [requiresUsername, setRequiresUsername] = useState(true);
  const [registrationToken, setRegistrationToken] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [captcha,setCaptcha]=useState<{data:string;token:string}|null>(null);
  const [captchaAnswer,setCaptchaAnswer]=useState("");
  const version = useRef(0); const navigate = useNavigate(); const [params] = useSearchParams();
  useEffect(() => { if (remaining <= 0) return; const id = window.setTimeout(() => setRemaining(remaining - 1), 1000); return () => clearTimeout(id); }, [remaining]);
  function changeEmail(value: string) { version.current++; setEmail(value); setChallenge(""); setCode(""); setMessage("");setCaptcha(null);setCaptchaAnswer("");setRequiresUsername(true);setRegistrationToken(""); }
  function changeMethod(value: typeof method) { if (busy) return; changeEmail(""); setMethod(value); setRemaining(0); setPassword(""); }
  async function sendCode() {
    const current = version.current; setBusy(true); setMessage(""); setChallenge("");
    try {
      let captchaToken:string|undefined;
      if(captcha){captchaToken=(await api.post<{captchaToken:string}>("/auth/captcha/verify",{token:captcha.token,key:captchaAnswer})).data.captchaToken;}
      const { data } = await api.post<{ challenge: string; requiresUsername?: boolean }>(`/auth/${method}/code`, {...(sms ? { phone: email } : { email }),...(captchaToken?{captchaToken}:{})});
      setCaptcha(null);setCaptchaAnswer("");
      if (version.current === current) { setChallenge(data.challenge); setRequiresUsername(data.requiresUsername !== false); setRemaining(60); setMessage(sms ? "验证码已发送，请检查手机短信" : "验证码已发送，请检查邮箱和垃圾邮件文件夹"); }
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
    event.preventDefault(); if ((!challenge && method !== "password" && !registrationToken) || busy) return; setBusy(true); setMessage("");
    try {
      let captchaToken: string | undefined;
      if (!registrationToken && method === "password" && captcha) captchaToken = (await api.post<{captchaToken:string}>("/auth/captcha/verify", {token:captcha.token,key:captchaAnswer})).data.captchaToken;
      const { data } = registrationToken ? await api.post<AuthResponse>("/auth/registration/complete", { registrationToken, username }) : method === "password"
        ? await api.post<AuthResponse>("/auth/password/login", { username: loginAccount, password, ...(captchaToken ? {captchaToken} : {}) })
        : await api.post<AuthResponse>(`/auth/${method}/verify`, { challenge, code, ...(requiresUsername && username ? { username } : {}) });
      storeCloudbaseSession(data); setAuthToken(data.token);
      navigate(getLoginDestination(params.get("next")));
    } catch (error: any) {
      setMessage(error.response?.data?.message ?? "登录失败，请稍后重试");
      if (error.response?.data?.usernameRequired) setRequiresUsername(true);
      if (error.response?.data?.registrationToken) { setRegistrationToken(error.response.data.registrationToken); setCaptcha(null); setCaptchaAnswer(""); }
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
      {([ ["sms", "手机验证码"], ["email", "邮箱验证码"], ["password", "密码登录"] ] as const).map(([value, text]) => <button key={value} type="button" aria-pressed={method === value} disabled={busy} onClick={() => changeMethod(value)}>{text}</button>)}
    </div>
    {method !== "password" && !registrationToken && <p className="auth-mode-note">新用户填写昵称，验证后注册。已有用户获取验证码后直接登录。</p>}
    {method === "password" && <p className="auth-mode-note">使用已绑定的手机号或邮箱及密码。首次使用或忘记密码？请先用验证码登录，在“账号设置”中设置密码。</p>}
    <form className="auth-form" onSubmit={submit}>
      {registrationToken ? <label>昵称<input required autoComplete="nickname" minLength={2} maxLength={32} placeholder="2–32 个字符，支持中文，注册必填" value={username} onChange={e => setUsername(e.target.value)} /></label> : method === "password" ? <>
        <label>手机号/邮箱<input autoComplete="username" required value={loginAccount} disabled={busy} onChange={e => setLoginAccount(e.target.value)} placeholder="手机号 / 邮箱" /></label>
        <label>登录密码<input type="password" autoComplete="current-password" required value={password} disabled={busy} onChange={e => setPassword(e.target.value)} /></label>
      </> : <label>{label}<input type={sms ? "tel" : "email"} autoComplete={sms ? "tel" : "email"} placeholder={sms ? "中国大陆手机号" : undefined} required value={email} disabled={busy} onChange={e => changeEmail(e.target.value)} /></label>}
      {captcha&&<div className="auth-captcha"><img src={captcha.data} alt="请识别图中的验证码"/><label>图形验证码<input autoComplete="off" maxLength={32} value={captchaAnswer} onChange={e=>setCaptchaAnswer(e.target.value)}/></label></div>}
      {method !== "password" && !registrationToken && <>
        <div className="auth-code-field"><label>验证码<input required pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" inputMode="numeric" value={code} disabled={busy} onChange={e => setCode(e.target.value)} /></label><button type="button" disabled={busy || remaining > 0 || !email || !!captcha && !captchaAnswer} onClick={() => void sendCode()}>{remaining > 0 ? `${remaining} 秒后重发` : "获取验证码"}</button></div>
        {requiresUsername && <label>昵称<input required autoComplete="nickname" minLength={2} maxLength={32} placeholder="2–32 个字符，支持中文，注册必填" value={username} onChange={e => setUsername(e.target.value)} /></label>}
      </>}
      <button className="auth-submit" type="submit" disabled={busy || (registrationToken ? !username : method === "password" ? !loginAccount || !password || !!captcha && !captchaAnswer : !challenge)}>{busy ? "请稍候…" : registrationToken ? "完成注册" : method === "password" ? "登录" : "验证并登录"}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></button>
    </form>
    <p className="message" role="status">{message}</p>
    </div>
  </section>;
}
