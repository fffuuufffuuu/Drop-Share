import { useEffect, useRef, useState } from "react";
import { api } from "../api";

// Keep successful metadata across focus/collapse remounts; bounded and short-lived.
const versions = new Map<string, { version: string; expires: number }>();
export function WorkThumbnail({ title, publicSlug, revision, readyVersion, hidden = false }: { title: string; publicSlug: string; revision: number; readyVersion?: string; hidden?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<string>();
  const [unavailable, setUnavailable] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [queued, setQueued] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setImage(undefined); setUnavailable(false); setLoaded(false); setQueued(false);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let objectUrl: string | undefined;
    let started = false, attempts = 0;
    const endpoint = `${String(api.defaults?.baseURL ?? "/api").replace(/\/$/, "")}/previews/${encodeURIComponent(publicSlug)}/thumbnail`;
    const key = `${publicSlug}:${revision}`;
    const remembered = versions.get(key);
    const version = !hidden && retry === 0 ? (revision === 0 ? readyVersion : undefined) ??
      (remembered && remembered.expires > Date.now() ? remembered.version : undefined) : undefined;
    async function load() {
      try {
        if (hidden) {
          const response = await api.get<Blob>(`/previews/${encodeURIComponent(publicSlug)}/thumbnail/private`, { responseType: "blob", signal: controller.signal });
          if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(response.data); setImage(objectUrl); }
          return;
        }
        const response = await fetch(`${endpoint}?revision=${revision}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 202 && ++attempts < 120) {
          setQueued(true);
          timer = setTimeout(() => void load(), attempts < 10 ? 3000 : 10_000); return;
        }
        if (!response.ok || response.status === 202) { setUnavailable(true); return; }
        const result = await response.json();
        if (!controller.signal.aborted) {
          versions.set(key, { version: result.version, expires: Date.now() + 60_000 });
          if (versions.size > 100) versions.delete(versions.keys().next().value!);
          setQueued(false); setImage(`${endpoint}/image?version=${encodeURIComponent(result.version)}`);
        }
      } catch { if (!controller.signal.aborted) setUnavailable(true); }
    }
    if (version) {
      setImage(`${endpoint}/image?version=${encodeURIComponent(version)}`);
      return () => controller.abort();
    }
    function start() { if (!started) { started = true; void load(); } }
    const observer = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { start(); observer?.disconnect(); }
    }, { rootMargin: "150px" }) : undefined;
    if (observer && container.current) observer.observe(container.current); else start();
    return () => { controller.abort(); clearTimeout(timer); observer?.disconnect(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [publicSlug, revision, readyVersion, retry, hidden]);
  return <div ref={container} className="work-thumbnail">
    {image && !unavailable && <img src={image} alt={`${title}预览`} crossOrigin="anonymous" loading="lazy" decoding="async"
      style={{ opacity: loaded ? 1 : 0 }} onLoad={() => setLoaded(true)} onError={() => {
        versions.delete(`${publicSlug}:${revision}`);
        if (retry === 0) setRetry(1); else setUnavailable(true);
      }} />}
    {(!loaded || unavailable) && <div className="work-thumbnail-placeholder"><svg viewBox="0 0 48 36" aria-hidden="true"><rect x="1" y="1" width="46" height="34" rx="4" /><path d="M1 10h46M7 6h1m4 0h1m4 0h1M12 21l-4 3 4 3m24-6 4 3-4 3m-9-10-6 16" /></svg>
      <span>{unavailable ? "暂无缩略图" : queued ? "预览图排队生成中" : "正在加载预览图"}</span></div>}
  </div>;
}
