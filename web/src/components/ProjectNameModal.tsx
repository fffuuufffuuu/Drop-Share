type ProjectNameModalProps = {
  open: boolean;
  title?: string;
  value: string;
  error?: string;
  hint?: string;
  confirmLabel: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function ProjectNameModal({
  open,
  title = "为此项目起一个名称",
  value,
  error,
  hint = "名称用于识别这个上传作品。",
  confirmLabel,
  onChange,
  onClose,
  onConfirm,
}: ProjectNameModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-name-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="project-name-modal-title">{title}</h3>
        <p className="hint">{hint}</p>
        <label htmlFor="project-name-input">
          项目名称
          <input
            id="project-name-input"
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="例如：我的作品集"
            maxLength={80}
            autoFocus
          />
        </label>
        {error && <p className="message">{error}</p>}
        <div className="row">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
