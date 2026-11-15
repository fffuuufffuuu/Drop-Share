import { useState } from "react";
import { api } from "../api";

export function AccountMigrationAdmin() {
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState("");
  const [message, setMessage] = useState("");
  function invalidate() { setRecoveryToken(""); setMessage(""); setConfirmed(false); }
  return <details className="account-section">
    <summary>旧手机号账号迁移审核</summary>
    <p className="hint">请通过原账号的可信联系方式或其他可靠材料人工核实本人身份。知道手机号、昵称或公开作品链接不构成身份证明。核实后，为指定原账号和新邮箱签发一次性迁移码。</p>
    <form className="auth-form" onSubmit={async event => {
      event.preventDefault(); if (busy || !confirmed) return;
      setBusy(true); setMessage(""); setRecoveryToken("");
      try {
        const { data } = await api.post<{ recoveryToken: string }>("/admin/account-migrations", { username, phone, email, confirmed });
        setRecoveryToken(data.recoveryToken); setMessage("迁移码已生成，15 分钟有效。请通过已核实的渠道交给本人；关联成功后自动失效。");
      } catch (error: any) { setMessage(error.response?.data?.message ?? "迁移码生成失败，请稍后重试"); }
      finally { setBusy(false); }
    }}>
      <label>原账号昵称/用户名<input required maxLength={32} value={username} disabled={busy} onChange={event => { setUsername(event.target.value); invalidate(); }} /></label>
      <label>已核实的原手机号<input type="tel" required value={phone} disabled={busy} onChange={event => { setPhone(event.target.value); invalidate(); }} /></label>
      <label>已确认的新邮箱<input type="email" required value={email} disabled={busy} onChange={event => { setEmail(event.target.value); invalidate(); }} /></label>
      <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />我已独立核实原账号属于申请人，并确认新邮箱</label>
      <button type="submit" disabled={busy || !confirmed}>生成迁移码</button>
    </form>
    {recoveryToken && <label className="account-migration-token">一次性迁移码<textarea readOnly autoComplete="off" value={recoveryToken} onFocus={event => event.target.select()} /></label>}
    <p className="message" role="status">{message}</p>
  </details>;
}
