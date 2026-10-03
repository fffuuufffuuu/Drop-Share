type EditSpaceModalProps = {
  open: boolean;
  name: string;
  slug: string;
  allowSlug: boolean;
  error: string;
  onNameChange: (value: string) => void;
  onSlugChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function EditSpaceModal({
  open, name, slug, allowSlug, error, onNameChange, onSlugChange, onClose, onConfirm,
}: EditSpaceModalProps) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="edit-space-title"
        onClick={(event) => event.stopPropagation()}>
        <h3 id="edit-space-title">编辑空间</h3>
        <label htmlFor="edit-space-name">空间名称
          <input id="edit-space-name" value={name} maxLength={80} autoFocus
            onChange={(event) => onNameChange(event.target.value)} />
        </label>
        {allowSlug && (
          <label htmlFor="edit-space-slug">网址后缀（slug）
            <input id="edit-space-slug" value={slug} maxLength={40}
              onChange={(event) => onSlugChange(event.target.value)} />
          </label>
        )}
        {allowSlug && <p className="hint">修改后，原空间入口链接将失效。slug 只能使用小写字母、数字和连字符。</p>}
        {error && <p className="message" role="alert">{error}</p>}
        <div className="row">
          <button type="button" onClick={onClose}>取消</button>
          <button type="button" onClick={onConfirm}>保存</button>
        </div>
      </div>
    </div>
  );
}
