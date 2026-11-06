import type { ReactNode } from "react";
export type Account = { username: string; loginUsername: string; phone: string; email: string };
export type AccountAction = "password" | "nickname" | "bind-phone" | "bind-email" | "rebind-phone" | "rebind-email";
function Icon({ kind }: { kind: "password" | "nickname" | "bind" | "rebind" }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{kind === "password" ? <><circle cx="8" cy="9" r="4" /><path d="m11 12 8 8m-3-3 3-3m-6 0 3-3" /></> : kind === "nickname" ? <path d="M4 20h4L20 8l-4-4L4 16v4ZM13 7l4 4" /> : kind === "bind" ? <><path d="m10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" /></> : <><path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 11-2l3 3M4 16l3 3a7 7 0 0 0 11-2" /></>}</svg>;
}
export function DashboardAccount({ account, onAction, disabled }: { account: Account; onAction: (action: AccountAction) => void; disabled?: boolean }) {
  const button = (label: string, action: AccountAction, kind: "password" | "nickname" | "bind" | "rebind") => <button type="button" className="account-field-action" aria-label={label} title={label} disabled={disabled} onClick={() => onAction(action)}><Icon kind={kind} /></button>;
  const field = (label: string, value: string, action: ReactNode) => <div><dt>{label}</dt><dd className="dashboard-account-binding"><span>{value}</span>{action}</dd></div>;
  return <section className="dashboard-account" aria-label="账号资料"><dl>
    {field("登录用户名", account.loginUsername || "未设置", button("修改密码", "password", "password"))}
    {field("昵称", account.username, button("修改昵称", "nickname", "nickname"))}
    {field("手机号", account.phone || "未绑定", account.phone ? button("重新绑定手机号", "rebind-phone", "rebind") : button("绑定手机号", "bind-phone", "bind"))}
    {field("邮箱", account.email || "未绑定", account.email ? button("重新绑定邮箱", "rebind-email", "rebind") : button("绑定邮箱", "bind-email", "bind"))}
  </dl></section>;
}
