export function WorkViewCount({ count = 0 }: { count?: number }) {
  const formatted = count.toLocaleString("en-US");
  return (
    <span className="work-view-count" aria-label={`访问次数：${formatted}`} title={`访问次数：${formatted}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <span>{formatted}</span>
    </span>
  );
}
