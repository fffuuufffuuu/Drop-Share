export function WorkActionIcon({ type }: { type: "download" | "hide" | "show" | "delete" }) {
  if (type === "download") {
    return <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3" />
    </svg>;
  }
  if (type === "hide") {
    return <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 4.2A10.9 10.9 0 0112 4c5.5 0 9 5.5 9 5.5a14.4 14.4 0 01-2.1 2.7M6.2 6.2C3.9 7.7 3 9.5 3 9.5S6.5 15 12 15c1 0 2-.2 2.8-.5" />
    </svg>;
  }
  if (type === "show") {
    return <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 7h16M9 7V4h6v3m-8 0l1 13h8l1-13M10 11v5m4-5v5" />
  </svg>;
}
