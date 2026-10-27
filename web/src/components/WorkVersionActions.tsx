import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import { UploadDropzone } from "./UploadDropzone";
import { WorkActionIcon } from "./WorkActionIcon";
import type { UploadEntry } from "../uploader";

export type VersionWork = { id: string; title: string; publicSlug: string; canUpdate?: boolean; canRollback?: boolean; hasPreviousVersion?: boolean };
export function WorkVersionActions({ work, action, onChanged }: {
  work: VersionWork; action: "update" | "rollback"; onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const allowed = action === "update" ? work.canUpdate === true : work.canRollback === true && work.hasPreviousVersion === true;
  useEffect(() => {
    if (!open) return;
    dialog.current?.focus();
    return () => trigger.current?.focus();
  }, [open]);
  async function submit() {
    if (busy || !allowed || (action === "update" && !entries.length)) return;
    setBusy(true); setError("");
    try {
      if (action === "update") {
        const form = new FormData();
        entries.forEach(entry => { form.append("files", entry.file); form.append("paths", entry.path); });
        await api.post(`/deployments/${work.id}/files`, form);
      } else await api.post(`/deployments/${work.id}/rollback`);
      window.dispatchEvent(new CustomEvent("work-version-changed", { detail: work.id }));
      setOpen(false); setEntries([]);
      await onChanged();
    } catch (failure: any) { setError(failure.response?.data?.message || "操作失败，请重试"); }
    finally { setBusy(false); }
  }
  if (!allowed) return null;
  return <>
    <button ref={trigger} type="button" className="work-icon-action" title={action === "update" ? "更新上传" : "退回上一版"}
      aria-label={action === "update" ? `更新上传${work.title}` : `退回${work.title}上一版`}
      onClick={() => { setError(""); setOpen(true); }}><WorkActionIcon type={action} /></button>
    {open && createPortal(<div className="space-modal-overlay" role="presentation">
      <div ref={dialog} className="space-modal work-version-modal" role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}
        onKeyDown={event => {
          if (event.key === "Escape" && !busy) setOpen(false);
          if (event.key === "Tab") {
            const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]'));
            const first = nodes[0], last = nodes[nodes.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }
        }}>
        <h2 id={id}>{action === "update" ? "更新上传" : "退回上一版"}：{work.title}</h2>
        <p>{action === "update" ? "替换文件，保留网址和统计" : "退回上一版文件，保留网址和统计。当前文件将保存为上一版，可以再次恢复。"}</p>
        {action === "update" && <p className="hint">将替换此作品的全部文件，不会与旧文件合并。请选择一个 HTML 文件或完整作品文件夹。</p>}
        {action === "update" && <UploadDropzone entries={entries} onEntriesChange={setEntries} onError={setError} />}
        {error && <p role="alert" className="message">{error}</p>}
        <div className="space-modal-actions">
          <button type="button" disabled={busy} onClick={() => setOpen(false)}>取消</button>
          <button type="button" disabled={busy || (action === "update" && !entries.length)} onClick={() => void submit()}>
            {busy ? "处理中…" : action === "update" ? "确认替换" : "确认退回"}</button>
        </div>
      </div>
    </div>, document.body)}
  </>;
}
