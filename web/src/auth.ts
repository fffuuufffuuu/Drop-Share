import type { CurrentUser } from "./types";

export const authChangedEvent = "drop-share-auth-changed";

export function notifyAuthChanged(): void {
  window.dispatchEvent(new Event(authChangedEvent));
}

export function getCurrentUser(): CurrentUser | null {
  const stored = localStorage.getItem("user");
  if (!stored) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(stored);
    if (
      typeof value !== "object"
      || value === null
      || !("id" in value)
      || typeof value.id !== "string"
      || !("username" in value)
      || typeof value.username !== "string"
    ) {
      return null;
    }

    const role = "role" in value ? value.role : "USER";
    if (role !== "USER" && role !== "ADMIN") {
      return null;
    }

    return {
      id: value.id,
      username: value.username,
      role,
    };
  } catch {
    return null;
  }
}
