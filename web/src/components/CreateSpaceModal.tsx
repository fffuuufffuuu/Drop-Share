import { useState } from "react";

import { api } from "../api";
import type { Space } from "../types";

type CreateSpaceModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (space: Space) => void;
};

export function CreateSpaceModal({
  open,
  onClose,
  onCreated,
}: CreateSpaceModalProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [durationDays, setDurationDays] = useState("365");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function createSpace() {
    const parsedDurationDays = Number(durationDays);
    if (
      !Number.isInteger(parsedDurationDays) ||
      parsedDurationDays < 1 ||
      parsedDurationDays > 365
    ) {
      setMessage("空间有效期必须是 1–365 天的整数");
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      const { data } = await api.post<Space>("/spaces", {
        name,
        slug: slug || undefined,
        durationDays: parsedDurationDays,
      });
      setName("");
      setSlug("");
      setDurationDays("365");
      onCreated(data);
    } catch (error: any) {
      setMessage(error.response?.data?.message || "创建空间失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-modal-overlay" role="presentation">
      <section
        className="space-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-space-title"
      >
        <h2 id="create-space-title">新建空间</h2>
        <label>
          空间名称
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          自定义网址后缀
          <input value={slug} onChange={(event) => setSlug(event.target.value)} />
        </label>
        <label>
          空间有效期（天）
          <input
            type="number"
            min={1}
            max={365}
            value={durationDays}
            onChange={(event) => setDurationDays(event.target.value)}
          />
        </label>
        <p className="hint">空间内所有作品会跟随空间同时到期。</p>
        {message && <p className="message" role="status">{message}</p>}
        <div className="space-modal-actions">
          <button type="button" disabled={submitting} onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            disabled={
              submitting ||
              !name.trim() ||
              !Number.isInteger(Number(durationDays)) ||
              Number(durationDays) < 1 ||
              Number(durationDays) > 365
            }
            onClick={() => void createSpace()}
          >
            {submitting ? "正在创建…" : "创建空间"}
          </button>
        </div>
      </section>
    </div>
  );
}
