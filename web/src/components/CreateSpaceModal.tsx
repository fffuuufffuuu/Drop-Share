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
  const [slugHelpVisible, setSlugHelpVisible] = useState(false);

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
          <span>
            空间名称 <span className="required-mark" aria-hidden="true">*</span>
          </span>
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div className="space-form-field">
          <div className="field-label-with-help">
            <label htmlFor="space-slug">自定义网址后缀</label>
            <button
              type="button"
              className="field-help-button"
              aria-label="查看自定义网址后缀示例"
              aria-describedby="space-slug-help"
              onMouseEnter={() => setSlugHelpVisible(true)}
              onMouseLeave={() => setSlugHelpVisible(false)}
              onFocus={() => setSlugHelpVisible(true)}
              onBlur={() => setSlugHelpVisible(false)}
            >
              ?
            </button>
            <span
              id="space-slug-help"
              className={`field-help-tooltip${slugHelpVisible ? " is-visible" : ""}`}
              role="tooltip"
            >
              例如填写 my-class，空间网址将是
              drop.yaoguosir.com/s/my-class；不填写时系统会随机生成。
            </span>
          </div>
          <input
            id="space-slug"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
          />
        </div>
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
