// Mock auth — swapped for real IMAP-verified auth once Cloud is available.
const KEY = "nyota.session";

export interface Session {
  email: string;
  displayName: string;
  role: "super_admin" | "company_admin" | "user";
  tenantId: string;
}

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function setSession(s: Session) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearSession() {
  localStorage.removeItem(KEY);
}
