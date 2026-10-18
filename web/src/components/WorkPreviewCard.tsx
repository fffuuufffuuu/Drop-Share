import { Children, Fragment, isValidElement, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { WorkViewCount } from "./WorkViewCount";

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
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
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
  viewCount?: number;
  meta: ReactNode;
  tags?: ReactNode;
  actions?: ReactNode;
  titleAction?: ReactNode;
  cardLink?: boolean;
};

function actionItems(nodes: ReactNode): ReactNode[] {
  return Children.toArray(nodes).flatMap((node) => {
    if (isValidElement<{ children?: ReactNode }>(node) && (node.type === Fragment || node.type === "div")) {
      return actionItems(node.props.children);
    }
    return [node];
  });
}

export function WorkPreviewCard({
  title, publicSlug, viewCount, meta, tags, actions, titleAction, cardLink = false,
}: WorkPreviewCardProps) {
  const href = `/p/${publicSlug}/`;
  const cardRef = useRef<HTMLElement>(null);
  const menuId = useId();
  const [hovered, setHovered] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = !dismissed && (hovered || keyboardFocus || pinned);
  const items = actionItems([titleAction, <CopyShareLinkButton key="copy" title={title} href={href} />, actions]);

  useEffect(() => {
    if (!open) return;
    function dismissOutside(event: PointerEvent) {
      if (!cardRef.current?.contains(event.target as Node)) {
        setPinned(false);
        setKeyboardFocus(false);
        setHovered(false);
      }
    }
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [open]);

  return (
    <article ref={cardRef} data-menu-open={open}
      className={`work-preview-card${cardLink ? " work-preview-card-clickable" : ""}`}
      onMouseEnter={() => { setHovered(true); setDismissed(false); }}
      onMouseLeave={() => { setHovered(false); setPinned(false); setDismissed(false); }}
      onFocusCapture={(event) => {
        if (event.target.matches(":focus-visible")) setKeyboardFocus(true);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setKeyboardFocus(false); setPinned(false); setDismissed(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault(); setPinned(false); setKeyboardFocus(false); setDismissed(true);
        }
      }}
    >
      <div className="work-card-surface">
        <div className="work-preview-frame">
          <iframe title={`${title}预览`} src={`${href}?preview=1`} loading="lazy"
            sandbox="allow-scripts allow-same-origin" tabIndex={-1} />
        </div>
        {cardLink && <a className="work-preview-open-overlay" href={href} target="_blank"
          rel="noreferrer" aria-label={`打开${title}`} />}
        <div className="work-preview-body">
          <h3>{title}</h3>
          {tags && <div className="work-preview-tags">{tags}</div>}
          <div className="work-preview-footer">
            <div className="work-preview-meta">{meta}</div>
            <WorkViewCount count={viewCount} />
          </div>
          {!cardLink && <a className="work-visit-link" href={href} target="_blank" rel="noreferrer"
            aria-label={`打开${title}`}>打开作品</a>}
        </div>
      </div>
      <button type="button" className="work-menu-toggle" aria-label={`${title}的更多操作`}
        aria-expanded={open} aria-controls={menuId}
        onClick={() => { setDismissed(pinned); setPinned(!pinned); }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
      </button>
      <div id={menuId} className="work-orbit" role="group" aria-label={`${title}的作品操作`}
        aria-hidden={!open} inert={!open}>
        {items.map((item, index) => {
          const angle = items.length === 1 ? 0 : (-64 + index * 128 / (items.length - 1)) * Math.PI / 180;
          const style = {
            "--fan-x": `${Math.cos(angle) * 52}px`,
            "--fan-y": `${Math.sin(angle) * 102}px`,
            "--fan-enter": `${index * 30}ms`,
            "--fan-exit": `${(items.length - index - 1) * 18}ms`,
          } as CSSProperties;
          return <div className="work-orbit-slot" key={index} style={style}>{item}</div>;
        })}
      </div>
    </article>
  );
}
