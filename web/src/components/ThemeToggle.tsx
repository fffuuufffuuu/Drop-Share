import { useEffect, useRef, useState } from "react";

const key = "drop-share:theme";
type Theme = "light" | "dark";
function savedTheme(): Theme | null {
  try { const value = localStorage.getItem(key); return value === "light" || value === "dark" ? value : null; }
  catch { return null; }
}
function systemTheme(): Theme { return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"; }

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => savedTheme() ?? systemTheme());
  const manual = useRef(!!savedTheme());
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const followSystem = () => { if (!manual.current) setTheme(systemTheme()); };
    const sync = (event: StorageEvent) => {
      if (event.key === key || event.key === null) { const saved = savedTheme(); manual.current = !!saved; setTheme(saved ?? systemTheme()); }
    };
    media?.addEventListener("change", followSystem); window.addEventListener("storage", sync);
    return () => { media?.removeEventListener("change", followSystem); window.removeEventListener("storage", sync); };
  }, []);
  const label = theme === "dark" ? "切换到明亮模式" : "切换到夜间模式";
  return <button type="button" className="theme-toggle" aria-label={label} title={label} onClick={() => {
    const next = theme === "dark" ? "light" : "dark"; manual.current = true; setTheme(next);
    try { localStorage.setItem(key, next); } catch { /* Retain the current session preference. */ }
  }}>
    <svg viewBox="0 0 24 24" aria-hidden="true">{theme === "dark" ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" /></> : <path d="M20.8 13.2A9 9 0 0 1 10.8 3a9 9 0 1 0 10 10.2Z" />}</svg>
  </button>;
}
