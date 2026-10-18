import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

type Account = { username: string; loginUsername: string; phone: string; email: string };
type Method = "sms" | "email";
export function AccountPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [method, setMethod] = useState<Method>("sms");
  const [challenge, setChallenge] = useState(""); const [code, setCode] = useState(""); const [proof, setProof] = useState("");
  const [contactMethod, setContactMethod] = useState<Method>("email"); const [identity, setIdentity] = useState("");
  const [contactChallenge, setContactChallenge] = useState(""); const [contactCode, setContactCode] = useState("");
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [captcha, setCaptcha] = useState<{ data: string; token: string; purpose: "proof" | "contact" } | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  useEffect(() => {
    let active = true;
    api.get<Account>("/auth/account").then(({ data }) => {
      if (!active) return;
      setAccount(data); setUsername(data.loginUsername || data.username);
      setMethod(data.phone ? "sms" : "email"); setContactMethod(data.email ? "sms" : "email");
    }).catch((error) => { if (active) setMessage(error.response?.data?.message ?? "无法读取账号信息，请重新登录"); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (!cooldown) return; const timer = window.setTimeout(() => setCooldown(cooldown - 1), 1000); return () => clearTimeout(timer); }, [cooldown]);
  useEffect(() => { if (!proof) return; const timer = window.setTimeout(() => { setProof(""); setChallenge(""); setCode(""); setContactChallenge(""); setMessage("身份验证已过期，请重新验证"); }, 9 * 60000); return () => clearTimeout(timer); }, [proof]);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setMessage("");
    try { await action(); }
    catch (error: any) { setMessage(error.response?.data?.message ?? "操作失败，请稍后重试"); }
    finally { setBusy(false); }
  }
  async function send(purpose: "proof" | "contact") {
    await run(async () => {
      try {
        let captchaToken: string | undefined;
        if (captcha?.purpose === purpose) captchaToken = (await api.post("/auth/captcha/verify", { token: captcha.token, key: captchaAnswer })).data.captchaToken;
        const { data } = await api.post(`/auth/account/${purpose}/code`, { ...(purpose === "proof" ? { method } : { method: contactMethod, identity, proof }), ...(captchaToken ? { captchaToken } : {}) });
        if (purpose === "proof") setChallenge(data.challenge); else setContactChallenge(data.challenge);
        setCooldown(60); setCaptcha(null); setCaptchaAnswer(""); setMessage("验证码已发送，请查收");
      } catch (error: any) {
        if (error.response?.data?.captchaRequired || captcha?.purpose === purpose) {
          setCaptcha({ ...(await api.post("/auth/captcha", {})).data, purpose }); setCaptchaAnswer("");
        }
        throw error;
      }
    });
  }
  const captchaField = (purpose: "proof" | "contact") => captcha?.purpose === purpose && <div className="auth-captcha"><img src={captcha.data} alt="请识别图中的验证码"/><label>图形验证码<input value={captchaAnswer} onChange={e => setCaptchaAnswer(e.target.value)} /></label></div>;
  const sendDisabled = (purpose: "proof" | "contact") => busy || cooldown > 0 || captcha?.purpose === purpose && !captchaAnswer;
  return <section className="card account-page">
    <header className="account-heading"><div><p className="dashboard-eyebrow">个人控制台</p><h2>账号设置</h2></div><Link to="/dashboard">返回我的作品</Link></header>
    <p className="message" role="status">{message}</p>
    {account && <>
      <div className="account-summary"><span>作品昵称 <strong>{account.username}</strong></span><span>手机号 <strong>{account.phone || "未绑定"}</strong></span><span>邮箱 <strong>{account.email || "未绑定"}</strong></span><span>登录用户名 <strong>{account.loginUsername || "尚未设置"}</strong></span></div>
      <p className="hint">在这里绑定的手机号、邮箱和登录用户名都属于当前账号，共用原有作品、空间与权限。请先绑定，再使用另一种方式登录。</p>
      <section className="account-section"><h3>1. 验证当前身份</h3>
      {proof ? <p className="account-verified">✓ 身份已验证，可继续设置（9 分钟内有效）<button type="button" disabled={busy} onClick={() => { setProof(""); setCode(""); setChallenge(""); }}>重新验证</button></p> : <form className="auth-form" onSubmit={e => { e.preventDefault(); void run(async () => { const { data } = await api.post("/auth/account/proof/verify", { challenge, code }); setProof(data.proof); setCode(""); setMessage("身份验证成功"); }); }}>
        <label>验证方式<select disabled={busy} value={method} onChange={e => { setMethod(e.target.value as Method); setChallenge(""); setCode(""); setCaptcha(null); }}>
          {account.phone && <option value="sms">已绑定手机号</option>}{account.email && <option value="email">已绑定邮箱</option>}
        </select></label>
        {captchaField("proof")}
        <div className="auth-code-field"><label>当前身份验证码<input required pattern="[0-9]{6}" maxLength={6} inputMode="numeric" autoComplete="one-time-code" disabled={busy} value={code} onChange={e => setCode(e.target.value)} /></label><button type="button" disabled={sendDisabled("proof")} onClick={() => void send("proof")}>{cooldown ? `${cooldown} 秒后重发` : "获取验证码"}</button></div>
        <button className="auth-submit" type="submit" disabled={busy || !challenge}>验证身份</button>
      </form>}</section>
      <div className="account-settings-grid">
      <section className="account-section"><h3>2. 绑定其他登录方式</h3>
      {account.phone && account.email ? <p className="hint">手机号与邮箱均已绑定，可使用任一方式登录。</p> : <form className="auth-form" onSubmit={e => { e.preventDefault(); void run(async () => {
        await api.post("/auth/account/contact/verify", { proof, challenge: contactChallenge, code: contactCode });
        const { data } = await api.get<Account>("/auth/account"); setAccount(data); setContactChallenge(""); setContactCode(""); setIdentity(""); setMessage("绑定成功，两种方式现在可以登录同一个账号");
      }); }}>
        <p className="hint">已有其他账号使用的手机号或邮箱不能直接绑定。</p>
        <label>新增登录方式<select value={contactMethod} disabled={busy || !proof} onChange={e => { setContactMethod(e.target.value as Method); setIdentity(""); setContactChallenge(""); setContactCode(""); setCaptcha(null); }}>
          {!account.email && <option value="email">邮箱</option>}{!account.phone && <option value="sms">手机号</option>}
        </select></label>
        <label>{contactMethod === "email" ? "新邮箱" : "新手机号"}<input type={contactMethod === "email" ? "email" : "tel"} required disabled={busy || !proof} value={identity} onChange={e => { setIdentity(e.target.value); setContactChallenge(""); setContactCode(""); setCaptcha(null); }} /></label>
        {captchaField("contact")}
        <div className="auth-code-field"><label>新登录方式验证码<input required pattern="[0-9]{6}" maxLength={6} inputMode="numeric" autoComplete="one-time-code" value={contactCode} disabled={busy || !proof} onChange={e => setContactCode(e.target.value)} /></label><button type="button" disabled={sendDisabled("contact") || !proof || !identity} onClick={() => void send("contact")}>{cooldown ? `${cooldown} 秒后重发` : "获取验证码"}</button></div>
        <button className="auth-submit" type="submit" disabled={busy || !proof || !contactChallenge}>绑定到当前账号</button>
      </form>}</section>
      <section className="account-section"><h3>3. 设置账号密码登录</h3>
      <form className="auth-form" onSubmit={e => { e.preventDefault(); void run(async () => {
        const { data } = await api.post("/auth/account/username", { proof, username }); setAccount({ ...account, loginUsername: data.loginUsername }); setMessage("登录用户名已保存，作品昵称保持不变");
      }); }}>
        <label>登录用户名<input required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_]+" autoComplete="username" value={username} disabled={busy || !proof} onChange={e => setUsername(e.target.value)} /></label>
        <button type="submit" disabled={busy || !proof}>保存登录用户名</button>
      </form>
      <form className="auth-form" onSubmit={e => { e.preventDefault(); if (password !== confirm) { setMessage("两次输入的密码不一致"); return; } void run(async () => {
        await api.post("/auth/account/password", { proof, password }); setPassword(""); setConfirm(""); setMessage("密码已设置，可使用已保存的登录用户名、绑定手机号或邮箱及新密码登录。其他设备可能需要重新登录。");
      }); }}>
        <p className="hint">旧网站密码不会自动导入。设置后可用登录用户名、已绑定手机号或邮箱配合新密码登录；作品昵称保持不变。</p>
        <label>新密码<input type="password" required minLength={8} maxLength={64} pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).+" autoComplete="new-password" title="8–64 位，包含大小写字母、数字和特殊字符" value={password} disabled={busy || !proof} onChange={e => setPassword(e.target.value)} /></label>
        <p className="hint">8–64 位，包含大小写字母、数字和特殊字符。</p>
        <label>确认新密码<input type="password" required autoComplete="new-password" value={confirm} disabled={busy || !proof} onChange={e => setConfirm(e.target.value)} /></label>
        <button className="auth-submit" type="submit" disabled={busy || !proof}>保存新密码</button>
      </form></section></div>
    </>}
  </section>;
}
