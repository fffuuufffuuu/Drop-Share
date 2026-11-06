import { formatDateTime } from "../format-datetime";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";

type Notification = { id: string; kind: string; title: string; content: string; href: string; createdAt: string; readAt: string | null };
type Cursor = { before: string; beforeId: string };
type Page = { notifications: Notification[]; next: Cursor | null };
const NotificationContext = createContext({ unreadCount: 0, refresh: async () => {} });
export const useNotifications = () => useContext(NotificationContext);
export function UnreadDot({ count }: { count: number }) { return count > 0 ? <span className="notification-dot" aria-hidden="true" /> : null; }

export function NotificationsProvider({ userId, children }: { userId?: string; children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const sequence = useRef(0);
  const pending = useRef<AbortController | undefined>(undefined);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    pending.current?.abort();
    if (!userId || !localStorage.getItem("token")) { setUnreadCount(0); return; }
    const controller = new AbortController(); pending.current = controller;
    try {
      const { data } = await api.get<{ unreadCount: number }>("/notifications/unread-count", { signal: controller.signal, timeout: 10_000 });
      if (request === sequence.current) setUnreadCount(Number.isFinite(data.unreadCount) ? Math.max(0, data.unreadCount) : 0);
    } catch { /* Keep the last known count during a temporary network failure. */ }
  }, [userId]);
  useEffect(() => {
    setUnreadCount(0); void refresh();
    const visibleRefresh = () => { if (document.visibilityState !== "hidden") void refresh(); };
    const timer = window.setInterval(visibleRefresh, 15_000);
    window.addEventListener("focus", visibleRefresh); document.addEventListener("visibilitychange", visibleRefresh);
    return () => { ++sequence.current; pending.current?.abort(); clearInterval(timer); window.removeEventListener("focus", visibleRefresh); document.removeEventListener("visibilitychange", visibleRefresh); };
  }, [refresh]);
  return <NotificationContext.Provider value={{ unreadCount, refresh }}>{children}</NotificationContext.Provider>;
}

export function NotificationsPanel() {
  const [items, setItems] = useState<Notification[]>([]);
  const [next, setNext] = useState<Cursor | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const { refresh, unreadCount } = useNotifications();
  const navigate = useNavigate();
  const active = useRef(true);
  const loadSequence = useRef(0);
  async function load(cursor?: Cursor) {
    const request = ++loadSequence.current;
    setBusy(true); setError("");
    try {
      const { data } = await api.get<Page>("/notifications", { params: cursor });
      if (!active.current || request !== loadSequence.current) return;
      setItems(current => cursor ? [...current, ...data.notifications.filter(item => !current.some(old => old.id === item.id))] : data.notifications);
      setNext(data.next); setLoaded(true); void refresh();
    } catch { if (active.current && request === loadSequence.current) setError("消息加载失败，请重试"); }
    finally { if (active.current && request === loadSequence.current) setBusy(false); }
  }
  useEffect(() => { active.current = true; void load(); return () => { active.current = false; ++loadSequence.current; }; }, []);
  async function markRead(item?: Notification, open = false) {
    if (busy) return; setBusy(true); setError("");
    try {
      if (item) await api.patch(`/notifications/${encodeURIComponent(item.id)}/read`);
      else await api.post("/notifications/read-all");
      if (!active.current) return;
      setItems(current => current.map(entry => !item || entry.id === item.id ? { ...entry, readAt: entry.readAt ?? new Date().toISOString() } : entry));
      void refresh();
      if (open && item) navigate(item.href);
    } catch { if (active.current) setError("标记已读失败，请重试"); }
    finally { if (active.current) setBusy(false); }
  }
  return <section className="notifications-panel" aria-label="消息列表">
    <div className="dashboard-panel-heading"><div><h2>消息</h2><p className="hint">系统通知与作品评论</p></div>
      <div className="notification-toolbar"><button type="button" disabled={busy} onClick={() => void load()}>刷新</button>
        <button type="button" disabled={busy || (!unreadCount && !items.some(item => !item.readAt))} onClick={() => void markRead()}>全部标为已读</button></div>
    </div>
    {error && <p role="alert">{error} <button type="button" disabled={busy} onClick={() => void load()}>重试</button></p>}
    {!loaded && busy && <p role="status">正在加载消息…</p>}
    {loaded && !items.length && <p className="empty-state">还没有消息</p>}
    <ul className="notification-list">{items.map(item => <li key={item.id} data-unread={!item.readAt}>
      <div className="notification-heading"><h3>{item.title}</h3>{!item.readAt && <span className="notification-unread-label">未读</span>}</div>
      <p>{item.content}</p><div className="notification-footer"><time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
        <div><Link to={item.href} onClick={event => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); void markRead(item, true); } }}>{item.kind === "space_admin" ? "进入空间" : "查看作品和评论"}</Link>
          {!item.readAt && <button type="button" disabled={busy} onClick={() => void markRead(item)}>标为已读</button>}</div>
      </div>
    </li>)}</ul>
    {next && <button type="button" disabled={busy} onClick={() => void load(next)}>加载更多消息</button>}
  </section>;
}
