import { useEffect, useState } from "react";

export function CopyShareLinkButton({ title, href }: { title: string; href: string }) {
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
