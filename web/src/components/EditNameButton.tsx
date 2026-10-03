type EditNameButtonProps = {
  label: string;
  onClick: () => void;
};

export function EditNameButton({ label, onClick }: EditNameButtonProps) {
  return (
    <button type="button" className="work-name-edit" aria-label={label} title={label} onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4L16.5 3.5Z" />
      </svg>
    </button>
  );
}
