import { useEffect, useId, useState } from "react";
import { api } from "../api";

type Contributor = { userId: string | null; username: string; workCount: number; role: "creator" | "admin" | "contributor" };
export function SpaceContributors({ spaceId, drawer = false, refreshKey = 0, onChanged }: {
  spaceId: string; drawer?: boolean; refreshKey?: number; onChanged?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(!drawer);
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [canManageAdmins, setCanManageAdmins] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    let active = true;
    setCanManageAdmins(false); setError("");
    void api.get(`/spaces/${spaceId}/contributors`).then(response => {
      if (active) setContributors(response.data?.contributors ?? []);
    }).catch(() => { if (active) setError("贡献者加载失败，请重新打开或刷新页面"); });
    if (localStorage.getItem("token")) void api.get(`/spaces/${spaceId}/permissions`).then(response => {
      if (active) setCanManageAdmins(response.data?.canManageAdmins === true);
    }).catch(() => { if (active) setCanManageAdmins(false); });
    return () => { active = false; };
  }, [spaceId, open, refreshKey]);
  async function toggle(person: Contributor) {
    if (!canManageAdmins || !person.userId || busy) return;
    setBusy(true); setError("");
    const enabled = person.role !== "admin";
    try {
      await api.put(`/spaces/${spaceId}/administrators/${person.userId}`, { enabled });
      setContributors(current => current.map(item => item.userId === person.userId ? { ...item, role: enabled ? "admin" : "contributor" } : item));
      await onChanged?.();
    } catch (failure: any) { setError(failure.response?.data?.message || "修改管理员权限失败"); }
    finally { setBusy(false); }
  }
  return <>
    {drawer && <button type="button" className="space-contributors-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>贡献者</button>}
    {open && <aside id={id} className={`space-contributors${drawer ? " space-contributors-drawer" : ""}`} aria-label="空间贡献者">
      <div className="space-contributors-heading"><h2>贡献者</h2>{drawer && <button type="button" aria-label="关闭贡献者" onClick={() => setOpen(false)}>关闭</button>}</div>
      <p className="hint">按空间内现有作品统计</p>
      {error && <p role="alert">{error}</p>}
      <ul>{contributors.map(person => <li key={person.userId ?? "anonymous"}>
        <div><strong>{person.username}</strong><span>{person.role === "creator" ? "创建者" : person.role === "admin" ? "管理员" : "贡献者"} · {person.workCount} 个作品</span></div>
        {canManageAdmins && person.userId && person.role !== "creator" && <button type="button" disabled={busy}
          aria-label={`${person.role === "admin" ? "撤销" : "授予"}${person.username}管理员`} onClick={() => void toggle(person)}>
          {person.role === "admin" ? "撤销管理员" : "授予管理员"}</button>}
      </li>)}</ul>
      {!contributors.length && !error && <p className="hint">暂无贡献者</p>}
    </aside>}
  </>;
}
