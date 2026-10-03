import { useEffect, useState, type ReactNode } from "react";

function CopyShareLinkButton({ title, href }: { title: string; href: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    if (status === "idle") return;
    const timeout = window.setTimeout(() => setStatus("idle"), 2500);
    return () => window.clearTimeout(timeout);
  }, [status]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(href, window.location.origin).href);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  }

  return (
    <>
      <button
        type="button"
        className="work-copy-link"
        aria-label={`复制${title}的分享链接`}
        title="复制分享链接"
        onClick={() => void copyLink()}
      >
        {status === "copied" ? (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
        )}
      </button>
      {status !== "idle" && (
        <span className={`work-copy-status${status === "error" ? " work-copy-status-error" : ""}`} role="status">
          {status === "copied" ? "已复制" : "复制失败"}
        </span>
      )}
    </>
  );
}

type WorkPreviewCardProps = {
  title: string;
  publicSlug: string;
  meta: ReactNode;
  actions?: ReactNode;
  titleAction?: ReactNode;
  cardLink?: boolean;
};

export function WorkPreviewCard({
  title,
  publicSlug,
  meta,
  actions,
  titleAction,
  cardLink = false,
}: WorkPreviewCardProps) {
  const href = `/p/${publicSlug}/`;

  return (
    <article className={`work-preview-card${cardLink ? " work-preview-card-clickable" : ""}`}>
      <div className="work-preview-frame">
        <iframe
          title={`${title}预览`}
          src={href}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin"
          tabIndex={-1}
        />
      </div>
      {cardLink && (
        <a className="work-preview-open-overlay" href={href} target="_blank" rel="noreferrer" aria-label={`打开${title}`} />
      )}
      <div className="work-preview-body">
        <div className="work-preview-title-row">
          <h3>{title}</h3>
          <div className="work-preview-title-actions">
            {titleAction}
            <CopyShareLinkButton title={title} href={href} />
          </div>
        </div>
        <div className="work-preview-meta">{meta}</div>
        {(!cardLink || actions) && <div className="work-preview-actions">
          {!cardLink && (
            <a href={href} target="_blank" rel="noreferrer" aria-label={`打开${title}`}>
              打开作品
            </a>
          )}
          {actions}
        </div>}
      </div>
    </article>
  );
}
