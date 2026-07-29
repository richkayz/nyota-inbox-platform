// Mock auth — swapped for real IMAP-verified auth once Cloud is available.
const KEY = "nyota.session";
const EXPIRED_FLAG = "nyota.session.expired";

export type SessionStatus = "active" | "expired" | "none";

export function getSessionStatus(): SessionStatus {
  if (typeof window === "undefined") return "none";
  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      const raw = storage.getItem(KEY);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Session;
      if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
        storage.removeItem(KEY);
        try { window.sessionStorage.setItem(EXPIRED_FLAG, "1"); } catch { /* ignore */ }
        return "expired";
      }
      return "active";
    } catch {
      // ignore and continue
    }
  }
  return "none";
}

export function consumeExpiredFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = window.sessionStorage.getItem(EXPIRED_FLAG);
    if (v) {
      window.sessionStorage.removeItem(EXPIRED_FLAG);
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

export interface Session {
  email: string;
  displayName: string;
  role: "super_admin" | "company_admin" | "user";
  tenantId: string;
  expiresAt?: number; // epoch ms; absent = session-only (sessionStorage)
}

function readFrom(storage: Storage | null): Session | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
      storage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  return readFrom(window.localStorage) ?? readFrom(window.sessionStorage);
}

export function setSession(s: Session, opts?: { remember?: boolean; ttlDays?: number }) {
  const remember = opts?.remember ?? false;
  const ttlDays = opts?.ttlDays ?? 30;
  // Clear the other store so the two never disagree.
  sessionStorage.removeItem(KEY);
  localStorage.removeItem(KEY);
  if (remember) {
    const withExpiry: Session = { ...s, expiresAt: Date.now() + ttlDays * 24 * 60 * 60 * 1000 };
    localStorage.setItem(KEY, JSON.stringify(withExpiry));
  } else {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
  sessionStorage.removeItem(KEY);
}
