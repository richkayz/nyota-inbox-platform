// Mock auth — swapped for real IMAP-verified auth once Cloud is available.
const KEY = "nyota.session";

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
