import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, setAuthToken } from "../api";
import { storeCloudbaseSession } from "../cloudbase-session";
import type { AuthResponse } from "../types";

export function EmailLoginPage({ method = "email" }: { method?: "sms" | "email" }) {
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
    event.preventDefault(); if (!challenge || busy) return; setBusy(true); setMessage("");
    try {
      const { data } = await api.post<AuthResponse>(`/auth/${method}/verify`, { challenge, code, ...(mode === "link" ? { legacyUsername, legacyPassword } : username ? { username } : {}) });
      storeCloudbaseSession(data); setAuthToken(data.token);
      navigate(params.get("next") === "/upload?createSpace=1" ? "/upload?createSpace=1" : "/upload");
    } catch (error: any) { setMessage(error.response?.data?.message ?? "登录失败，请重新获取验证码后重试"); }
    finally { setBusy(false); }
  }
  return <section className="card">
    <h2>{label}验证码登录</h2>
    <div className="auth-mode-switch" role="group" aria-label="登录或关联旧账号">
      <button type="button" aria-pressed={mode === "login"} onClick={() => setMode("login")}>登录 / 注册</button>
      <button type="button" aria-pressed={mode === "link"} onClick={() => setMode("link")}>关联旧账号</button>
    </div>
    <p className="hint">{mode === "link" ? "验证原账号并绑定新登录身份，保留原有作品、空间和权限。" : "新用户完成验证后自动注册；已有作品的用户首次使用请选择关联旧账号。"}</p>
    <form onSubmit={submit}>
      <label>{label}<input type={sms ? "tel" : "email"} autoComplete={sms ? "tel" : "email"} placeholder={sms ? "中国大陆手机号" : undefined} required value={email} disabled={busy} onChange={e => changeEmail(e.target.value)} /></label>
      {captcha&&<div><img src={captcha.data} alt="请识别图中的验证码"/><label>图形验证码<input autoComplete="off" maxLength={32} value={captchaAnswer} onChange={e=>setCaptchaAnswer(e.target.value)}/></label></div>}
      <button type="button" disabled={busy || remaining > 0 || !email || !!captcha&&!captchaAnswer} onClick={() => void sendCode()}>{remaining > 0 ? `${remaining} 秒后重发` : "获取验证码"}</button>
      <label>验证码<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value)} /></label>
      {mode === "link" ? <>
        <label>原用户名<input autoComplete="username" required value={legacyUsername} onChange={e => setLegacyUsername(e.target.value)} /></label>
        <label>原密码<input type="password" autoComplete="current-password" required value={legacyPassword} onChange={e => setLegacyPassword(e.target.value)} /></label>
      </> : <label>新用户昵称（选填）<input autoComplete="nickname" minLength={3} maxLength={32} pattern="[a-zA-Z0-9_]+" placeholder="字母、数字或下划线，已有用户无需填写" value={username} onChange={e => setUsername(e.target.value)} /></label>}
      <button className="auth-submit" type="submit" disabled={!challenge || busy}>验证并登录</button>
    </form>
    <p className="message" role="status">{message}</p>
  </section>;
}
