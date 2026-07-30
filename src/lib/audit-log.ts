// Mock per-tenant audit log. Swapped for a server-signed hash-chained
// audit_logs table once Cloud is available.
const KEY_PREFIX = "nyota.audit.";
const MAX_ENTRIES_PER_TENANT = 500;

export type AuditEventType =
  | "login.success"
  | "login.failure"
  | "logout"
  | "session.expired"
  | "password.reset.requested"
  | "password.reset.completed"
  | "password.change.success"
  | "password.change.failure";

export interface AuditEntry {
  id: string;
  tenantId: string;
  type: AuditEventType;
  email?: string;
  at: number; // epoch ms
  ip?: string; // unknown in mock
  userAgent?: string;
  meta?: Record<string, string | number | boolean>;
}

function storageKey(tenantId: string) {
  return `${KEY_PREFIX}${tenantId}`;
}

function readAll(tenantId: string): AuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(tenantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AuditEntry[]) : [];
  } catch {
    return [];
  }
}

function writeAll(tenantId: string, entries: AuditEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(tenantId), JSON.stringify(entries));
  } catch {
    // storage full or blocked — silently drop
  }
}

export function recordAuditEvent(
  input: Omit<AuditEntry, "id" | "at" | "userAgent"> & { at?: number },
): AuditEntry {
  const entry: AuditEntry = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    at: input.at ?? Date.now(),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    tenantId: input.tenantId,
    type: input.type,
    email: input.email,
    meta: input.meta,
  };
  const all = readAll(entry.tenantId);
  all.unshift(entry);
  if (all.length > MAX_ENTRIES_PER_TENANT) all.length = MAX_ENTRIES_PER_TENANT;
  writeAll(entry.tenantId, all);
  return entry;
}

export function getAuditEntries(tenantId: string, limit = 100): AuditEntry[] {
  return readAll(tenantId).slice(0, limit);
}

export function clearAuditLog(tenantId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(tenantId));
}

export function auditEventLabel(type: AuditEventType): string {
  switch (type) {
    case "login.success": return "Sign in";
    case "login.failure": return "Failed sign in";
    case "logout": return "Sign out";
    case "session.expired": return "Session expired";
    case "password.reset.requested": return "Password reset requested";
    case "password.reset.completed": return "Password reset completed";
  }
}
