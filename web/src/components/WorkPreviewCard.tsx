import { Children, Fragment, isValidElement, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { WorkViewCount } from "./WorkViewCount";
import { useWorkCardFocus } from "./WorkCardGrid";
import { WorkDiscussion } from "./WorkDiscussion";
import { WorkThumbnail } from "./WorkThumbnail";
import { CopyShareLinkButton } from "./CopyShareLinkButton";

type WorkPreviewCardProps = {
  workId?: string;
  title: string;
  publicSlug: string;
  thumbnailVersion?: string;
  viewCount?: number;
  uploaderName?: string;
  meta: ReactNode;
  tags?: ReactNode;
  actions?: ReactNode;
  titleAction?: ReactNode;
  cardLink?: boolean;
  hidden?: boolean;
  focusRequested?: boolean;
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
  workId, title, publicSlug, thumbnailVersion, viewCount, uploaderName, meta, tags, actions, titleAction, cardLink = false, hidden = false, focusRequested = false,
}: WorkPreviewCardProps) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const changed = (event: Event) => { if ((event as CustomEvent).detail === workId) setRevision(value => value + 1); };
    window.addEventListener("work-version-changed", changed);
    return () => window.removeEventListener("work-version-changed", changed);
  }, [workId]);
  const href = `/p/${publicSlug}/`;
  const cardRef = useRef<HTMLElement>(null);
  const menuId = useId();
  const focus = useWorkCardFocus();
  useEffect(() => { if (focusRequested) focus?.focus(menuId); }, [focusRequested, menuId]);
  const expanded = focus?.focused === menuId;
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== "hidden");
  useEffect(() => {
    const changed = () => setPageVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  const [hovered, setHovered] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = expanded || (!dismissed && (hovered || keyboardFocus || pinned));
  const items = actionItems([titleAction, <CopyShareLinkButton key="copy" title={title} href={href} />, actions]);
  const focusedActions = <div id={menuId} className="work-focused-actions" role="group" aria-label={`${title}的作品操作`}>
    {items.map((item, index) => <div className="work-focused-action" key={index}>{item}</div>)}
  </div>;

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
    <article ref={cardRef} data-hidden={hidden} data-menu-open={open && !expanded} data-expanded={!!expanded}
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
        if ((event.target as Element).closest('[role="dialog"]')) return;
        if (event.key === "Escape") {
          event.preventDefault(); setPinned(false); setKeyboardFocus(false); setDismissed(true);
          focus?.focus(null);
        }
      }}
    >
      <div className="work-card-surface">
        <div className="work-preview-frame">
          {expanded && pageVisible && !hidden ? <iframe title={`${title}预览`} src={`${href}?preview=1${revision ? `&revision=${revision}` : ""}`} loading="lazy"
            sandbox="allow-scripts allow-same-origin" tabIndex={-1} /> : <WorkThumbnail title={title} publicSlug={publicSlug} revision={revision} readyVersion={thumbnailVersion} hidden={hidden} />}
          {expanded && !hidden && <a className="work-preview-visit-overlay" href={href} target="_blank"
            rel="noreferrer" aria-label={`打开${title}的预览`} />}
        </div>
        {cardLink && !expanded && <button type="button" className="work-preview-open-overlay"
          aria-label={`展开${title}`} aria-expanded={false} onClick={() => focus?.focus(menuId)} />}
        <div className="work-preview-body">
          <h3>{expanded && !hidden ? <a className="work-title-link" href={href} target="_blank" rel="noreferrer">{title}</a> : title}</h3>
          {tags && <div className="work-preview-tags">{tags}</div>}
          <div className="work-preview-footer">
            <div className={`work-preview-meta${uploaderName ? " work-preview-meta-with-uploader" : ""}`}>
              {uploaderName && <span className="work-preview-uploader">上传者：{uploaderName}</span>}
              <div className="work-preview-context">{meta}</div>
            </div>
            <WorkViewCount count={viewCount} />
          </div>
          {!cardLink && !expanded && !hidden && <a className="work-visit-link" href={href} target="_blank" rel="noreferrer"
            aria-label={`打开${title}`}>打开作品</a>}
          {expanded && (workId ? <WorkDiscussion workId={workId} actions={focusedActions} /> : focusedActions)}
        </div>
        {hidden && <div className="work-hidden-preview-mask"><div className="work-hidden-preview-label">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M9 5a12 12 0 0 1 3-.4c6 0 10 7.4 10 7.4a19 19 0 0 1-3 3.5M6 6a22 22 0 0 0-4 6s4 7.4 10 7.4a12 12 0 0 0 5-1.2M10 10a3 3 0 0 0 4 4" /></svg>
          <span>作品已隐藏</span>
        </div></div>}
      </div>
      {!expanded && <><button type="button" className="work-menu-toggle" aria-label={`${title}的更多操作`}
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
      </div></>}
    </article>
  );
}
