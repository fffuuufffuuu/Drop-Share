import { useState } from "react";
import "./UserAvatar.css";
export function UserAvatar({ username, avatarUrl, label }: { username: string; avatarUrl?: string | null; label?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const initial = Array.from(username.trim()).find(char => !/[\s\p{Cf}\p{Cc}\p{M}]/u.test(char)) ?? "匿";
  const glyph = /\p{Script=Latin}/u.test(initial) ? initial.toUpperCase() : initial;
  const safeUrl = avatarUrl && /^(https?:\/\/|\/(?!\/))/.test(avatarUrl) ? avatarUrl : null;
  return <span className="user-avatar" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    {safeUrl && failed !== safeUrl ? <img src={safeUrl} alt={label ?? ""} onError={() => setFailed(safeUrl)} /> : <span>{glyph}</span>}
  </span>;
}
