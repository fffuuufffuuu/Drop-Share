import { useEffect, useId, useRef, useState } from "react";
import { api } from "../api";

type Contributor = { userId: string | null; username: string; workCount: number; viewCount?: number; role: "creator" | "admin" | "contributor" };
export function SpaceContributors({ spaceId, drawer = false, refreshKey = 0, onChanged }: {
  spaceId: string; drawer?: boolean; refreshKey?: number; onChanged?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(!drawer);
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [canManageAdmins, setCanManageAdmins] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const hoverRoot = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [panelHeight, setPanelHeight] = useState(48);
  const cache = useRef<{ key: string; time: number } | undefined>(undefined);
  const id = useId();
  useEffect(() => {
    const panel = panelRef.current;
    if (!drawer || !open || !panel) return;
    const measure = () => setPanelHeight(panel.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure); observer.observe(panel);
    return () => observer.disconnect();
  }, [drawer, open, contributors, loading, error]);
  useEffect(() => {
    if (drawer && !open) return;
    const key = `${spaceId}:${refreshKey}`;
    if (drawer && cache.current?.key === key && Date.now() - cache.current.time < 30_000) return;
    let active = true;
    setCanManageAdmins(false); setError(""); setLoading(true);
    void api.get(`/spaces/${spaceId}/contributors`).then(response => {
      if (active) { setContributors(response.data?.contributors ?? []); cache.current = { key, time: Date.now() }; }
    }).catch(() => { if (active) setError("贡献者加载失败，请重新打开或刷新页面"); }).finally(() => { if (active) setLoading(false); });
    if (!drawer && localStorage.getItem("token")) void api.get(`/spaces/${spaceId}/permissions`).then(response => {
      if (active) setCanManageAdmins(response.data?.canManageAdmins === true);
    }).catch(() => { if (active) setCanManageAdmins(false); });
    return () => { active = false; };
  }, [spaceId, open, refreshKey, drawer]);
  useEffect(() => {
    if (!drawer || !open) return;
    const outside = (event: PointerEvent) => { if (!hoverRoot.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [drawer, open]);
  async function toggle(person: Contributor) {
    if (drawer || !canManageAdmins || !person.userId || busy) return;
    setBusy(true); setError("");
    const enabled = person.role !== "admin";
    try {
      await api.put(`/spaces/${spaceId}/administrators/${person.userId}`, { enabled });
      setContributors(current => current.map(item => item.userId === person.userId ? { ...item, role: enabled ? "admin" : "contributor" } : item));
      await onChanged?.();
    } catch (failure: any) { setError(failure.response?.data?.message || "修改管理员权限失败"); }
    finally { setBusy(false); }
  }
  const panel = <aside ref={panelRef} id={id} className={`space-contributors${drawer ? " space-contributors-drawer" : ""}`} aria-label="空间贡献者">
    <div className="space-contributors-heading"><h2>贡献者</h2></div>
    {!drawer && <p className="hint">按空间内现有作品统计</p>}
    {error && <p role="alert">{error}</p>}
    {loading && !contributors.length && <p role="status">正在加载贡献者…</p>}
    <ul>{contributors.map(person => <li key={person.userId ?? "anonymous"}>
      {drawer ? <div className="contributor-summary">
        <div className="contributor-identity"><strong>{person.username}</strong><span className="contributor-role">{person.role === "creator" ? "创建者" : person.role === "admin" ? "管理员" : "贡献者"}</span></div>
        <div className="contributor-stats">
          <span aria-label={`${person.workCount} 个作品`} title="作品数">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg>
            {person.workCount.toLocaleString()}
          </span>
          <span aria-label={`${(person.viewCount ?? 0).toLocaleString()} 次访问`} title="累计访问量">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
            {(person.viewCount ?? 0).toLocaleString()}
          </span>
        </div>
      </div> : <div><strong>{person.username}</strong><span>{person.role === "creator" ? "创建者" : person.role === "admin" ? "管理员" : "贡献者"} · {person.workCount} 个作品 · {(person.viewCount ?? 0).toLocaleString()} 次访问</span></div>}
      {!drawer && canManageAdmins && person.userId && person.role !== "creator" && <button type="button" disabled={busy}
        aria-label={`${person.role === "admin" ? "撤销" : "授予"}${person.username}管理员`} onClick={() => void toggle(person)}>
        {person.role === "admin" ? "撤销管理员" : "授予管理员"}</button>}
    </li>)}</ul>
    {!contributors.length && !error && !loading && <p className="hint">暂无贡献者</p>}
  </aside>;
  if (!drawer) return panel;
  return <div ref={hoverRoot} className="space-contributors-hover" data-open={open} style={{ height: open ? panelHeight + 2 : 48 }}
    onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
    onFocusCapture={() => setOpen(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); } }}>
    <button type="button" className="space-contributors-toggle" aria-label="查看空间贡献者" title="贡献者"
      aria-expanded={open} aria-controls={id} onClick={() => setOpen(true)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M17 13a5 5 0 0 1 4 5v3" /></svg>
    </button>
    {open && panel}
  </div>;
}
