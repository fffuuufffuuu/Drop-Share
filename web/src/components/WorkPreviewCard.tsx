import type { ReactNode } from "react";

type WorkPreviewCardProps = {
  title: string;
  publicSlug: string;
  meta: ReactNode;
  actions?: ReactNode;
};

export function WorkPreviewCard({
  title,
  publicSlug,
  meta,
  actions,
}: WorkPreviewCardProps) {
  const href = `/p/${publicSlug}`;

  return (
    <article className="work-preview-card">
      <div className="work-preview-frame">
        <iframe
          title={`${title}预览`}
          src={href}
          loading="lazy"
          sandbox=""
          tabIndex={-1}
        />
      </div>
      <div className="work-preview-body">
        <h3>{title}</h3>
        <div className="work-preview-meta">{meta}</div>
        <div className="work-preview-actions">
          <a href={href} target="_blank" rel="noreferrer" aria-label={`打开${title}`}>
            打开作品
          </a>
          {actions}
        </div>
      </div>
    </article>
  );
}
