import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api } from "../api";
import { getCurrentUser } from "../auth";

type Comment = { id: string; authorName: string; content: string; createdAt: string; canManage?: boolean };
type Discussion = { description: string; comments: Comment[]; canEdit: boolean; canComment: boolean };

export function WorkDiscussion({ workId, actions }: { workId: string; actions?: ReactNode }) {
  const [data, setData] = useState<Discussion | null>(null);
  const [error, setError] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [posted, setPosted] = useState(false);
  useEffect(() => {
    let active = true;
    setError("");
    api.get<Discussion>(`/deployments/${encodeURIComponent(workId)}/discussion`).then(({ data }) => {
      if (active) { setData(data); setDescription(data.description); }
    }).catch(() => { if (active) setError("简介和评论加载失败，请重试"); });
    return () => { active = false; };
  }, [workId, reload]);
  async function saveDescription(event: FormEvent) {
    event.preventDefault(); if (!data || busy) return;
    setBusy(true); setError("");
    try {
      const response = await api.patch<{ description: string }>(`/deployments/${encodeURIComponent(workId)}/description`, { description });
      setData(current => current && { ...current, description: response.data.description }); setEditing(false);
    } catch (error: any) { setError(error.response?.data?.message || "保存失败，请重试"); }
    finally { setBusy(false); }
  }
  return <div className="work-discussion">
    {error && <p role="alert">{error} {!data && <button type="button" onClick={() => setReload(value => value + 1)}>重试</button>}</p>}
    {!data ? !error && <p role="status">正在加载简介和评论…</p> : <>
      <section className="work-description"><div className="work-detail-heading"><h4>作品简介</h4>
        {data.canEdit && !editing && <button type="button" onClick={() => setEditing(true)}>编辑简介</button>}</div>
        {editing ? <form onSubmit={event => void saveDescription(event)}>
          <textarea aria-label="作品简介" maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} />
          <div className="work-detail-form-actions"><button disabled={busy}>保存简介</button><button type="button" disabled={busy} onClick={() => { setEditing(false); setDescription(data.description); }}>取消</button></div>
        </form> : <p>{data.description || "作者暂未填写简介"}</p>}
      </section>
      {actions}
      <section className="work-comments"><h4>用户评论{data.comments.length > 0 && ` · ${data.comments.length}${data.comments.length === 100 ? "+" : ""}`}</h4>
        <div className="work-comment-list">{data.comments.length ? data.comments.map(comment => <CommentItem key={comment.id} workId={workId} comment={comment}
          onUpdated={updated => setData(current => current && { ...current, comments: current.comments.map(item => item.id === updated.id ? updated : item) })}
          onDeleted={() => setData(current => current && { ...current, comments: current.comments.filter(item => item.id !== comment.id) })}
        />) : <p className="hint">还没有评论</p>}</div>
        {posted && <p className="work-comment-posted" role="status">评论已发布</p>}
        <CommentComposer key={commentDraftKey(workId)} workId={workId} canComment={data.canComment} onPosted={comment => {
          setData(current => current && { ...current, comments: [comment, ...current.comments].slice(0, 100) });
          setPosted(true);
        }} />
      </section>
    </>}
    {!data && actions}
  </div>;
}

function CommentItem({ workId, comment, onUpdated, onDeleted }: { workId: string; comment: Comment; onUpdated: (comment: Comment) => void; onDeleted: () => void }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [content, setContent] = useState(comment.content);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy || !content.trim()) return;
    setBusy(true); setError("");
    try {
      const response = await api.patch<Comment>(`/deployments/${encodeURIComponent(workId)}/comments/${encodeURIComponent(comment.id)}`, { content });
      onUpdated(response.data); setEditing(false);
    } catch (failure: any) { setError(failure.response?.data?.message || "保存评论失败，请重试"); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (busy) return; setBusy(true); setError("");
    try { await api.delete(`/deployments/${encodeURIComponent(workId)}/comments/${encodeURIComponent(comment.id)}`); onDeleted(); }
    catch (failure: any) { setError(failure.response?.data?.message || "删除评论失败，请重试"); }
    finally { setBusy(false); }
  }
  return <div className="work-comment">
    <div><strong>{comment.authorName}</strong><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time></div>
    {editing ? <form onSubmit={event => void save(event)}>
      <textarea aria-label="编辑评论" autoFocus maxLength={1000} required value={content} disabled={busy} onChange={event => setContent(event.target.value)} />
      <div className="work-detail-form-actions"><button disabled={busy || !content.trim()}>保存评论</button><button type="button" disabled={busy} onClick={() => { setEditing(false); setError(""); }}>取消</button></div>
    </form> : <p>{comment.content}</p>}
    {comment.canManage && !editing && <div className="work-comment-actions">
      {confirmDelete ? <><span>删除这条评论？</span><button type="button" disabled={busy} onClick={() => void remove()}>确认删除</button><button type="button" disabled={busy} onClick={() => { setConfirmDelete(false); setError(""); }}>取消删除</button></> : <>
        <button type="button" onClick={() => { setContent(comment.content); setEditing(true); setError(""); }}>编辑评论</button>
        <button type="button" onClick={() => { setConfirmDelete(true); setError(""); }}>删除评论</button>
      </>}
    </div>}
    {error && <p role="alert" className="work-comment-error">{error}</p>}
  </div>;
}


function commentDraftKey(workId: string) {
  let account = "guest";
  try { account = getCurrentUser()?.id ?? "guest"; } catch { /* Storage may be unavailable. */ }
  return `drop-share:comment-draft:${account}:${workId}`;
}
function readCommentDraft(key: string) {
  try { return (sessionStorage.getItem(key) ?? "").slice(0, 1000); } catch { return ""; }
}
function cacheCommentDraft(key: string, content: string) {
  try { if (content) sessionStorage.setItem(key, content); else sessionStorage.removeItem(key); }
  catch { /* Keep the in-memory draft if browser storage is unavailable. */ }
}

function CommentComposer({ workId, canComment, onPosted }: { workId: string; canComment: boolean; onPosted: (comment: Comment) => void }) {
  const [open, setOpen] = useState(false);
  const draftKey = commentDraftKey(workId);
  const [content, setContent] = useState(() => canComment ? readCommentDraft(draftKey) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = useId();
  const composer = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) (canComment ? input.current : closeButton.current)?.focus({ preventScroll: true });
  }, [open, canComment]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!composer.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function close(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => toggle.current?.focus({ preventScroll: true }));
  }
  async function publish(event: FormEvent) {
    event.preventDefault();
    if (!canComment || busy || !content.trim()) return;
    setBusy(true); setError("");
    try {
      const response = await api.post<Comment>(`/deployments/${encodeURIComponent(workId)}/comments`, { content });
      if (readCommentDraft(draftKey) === content) cacheCommentDraft(draftKey, "");
      onPosted(response.data); setContent(""); close();
    } catch (error: any) { setError(error.response?.data?.message || "评论发布失败，请重试"); }
    finally { setBusy(false); }
  }
  return <div ref={composer} id={id} className="work-comment-composer" data-open={open} data-guest={!canComment}
    role={open ? "dialog" : undefined} aria-label={open ? "发表评论" : undefined}
    onKeyDown={event => { if (open && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } }}>
    {!open ? <button ref={toggle} type="button" className="work-comment-toggle" aria-label="添加评论" aria-expanded={false} aria-controls={id}
      onClick={() => setOpen(true)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-8 8H5l-3 2v-10a9 9 0 0 1 18 0Z" /><path d="M7 9h8M7 13h5" /></svg>
    </button> : <div className="work-comment-dialog">
      <div className="work-comment-dialog-heading"><h4>发表评论</h4>
        <button ref={closeButton} type="button" className="work-comment-close" aria-label="收起评论输入区" onClick={() => close()}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </div>
      {canComment ? <form onSubmit={event => void publish(event)}>
        <textarea ref={input} aria-label="发表评论" placeholder="分享你的体验或建议" maxLength={1000}
          value={content} onChange={event => {
            const value = event.target.value.slice(0, 1000);
            setContent(value); cacheCommentDraft(draftKey, value);
          }} disabled={busy} required />
        {error && <p className="work-comment-error" role="alert">{error}</p>}
        <div className="work-comment-dialog-footer"><button type="submit" disabled={busy || !content.trim()}>{busy ? "发布中…" : "发表评论"}</button></div>
      </form> : <div className="work-comment-login"><p>注册并登录后可发表评论</p><a href="/login">去登录</a></div>}
    </div>}
  </div>;
}
