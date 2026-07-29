// Live HTTP adapter — talks to the NestJS gateway (gateway/).
// Handles bearer-token attachment and one automatic refresh on 401.

import type {
  AuthTokens,
  Contact,
  Diagnostics,
  FolderSummary,
  HealthCheck,
  MailClient,
  MessageDetail,
  MessageListItem,
  Page,
  SendMessageInput,
  SseEvent,
} from "./types";

const ACCESS_KEY = "nyota.tokens.access";
const REFRESH_KEY = "nyota.tokens.refresh";

function readTokens(): AuthTokens | null {
  if (typeof window === "undefined") return null;
  const a = window.localStorage.getItem(ACCESS_KEY);
  const r = window.localStorage.getItem(REFRESH_KEY);
  if (!a || !r) return null;
  return { accessToken: a, refreshToken: r, expiresIn: 0 };
}

function writeTokens(t: AuthTokens) {
  window.localStorage.setItem(ACCESS_KEY, t.accessToken);
  window.localStorage.setItem(REFRESH_KEY, t.refreshToken);
}

function clearTokens() {
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

export function createHttpAdapter(baseUrl: string): MailClient {
  let refreshing: Promise<AuthTokens> | null = null;

  async function refresh(): Promise<AuthTokens> {
    if (refreshing) return refreshing;
    const t = readTokens();
    if (!t) throw new Error("Not signed in");
    refreshing = fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: t.refreshToken }),
    })
      .then(async (r) => {
        if (!r.ok) {
          clearTokens();
          throw new Error("Session expired");
        }
        const next = (await r.json()) as AuthTokens;
        writeTokens(next);
        return next;
      })
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  }

  async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
    const t = readTokens();
    const headers = new Headers(init.headers);
    if (t) headers.set("authorization", `Bearer ${t.accessToken}`);
    if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
    if (res.status === 401 && retry) {
      await refresh();
      return request<T>(path, init, false);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Gateway ${res.status}: ${text || res.statusText}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    async login(email, password, tenantId) {
      const tokens = await request<AuthTokens>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, tenantId }),
      });
      writeTokens(tokens);
      return tokens;
    },
    refresh,
    async logout() {
      try {
        await request<void>("/auth/logout", { method: "POST" });
      } finally {
        clearTokens();
      }
    },

    listFolders: () => request<FolderSummary[]>("/mail/folders"),
    listMessages: ({ folder, cursor, limit = 30, q }) => {
      const params = new URLSearchParams({ folder, limit: String(limit) });
      if (cursor) params.set("cursor", cursor);
      if (q) params.set("q", q);
      return request<Page<MessageListItem>>(`/mail/messages?${params.toString()}`);
    },
    getMessage: (folder, uid) =>
      request<MessageDetail>(`/mail/messages/${encodeURIComponent(folder)}/${uid}`),
    setFlags: (folder, uid, add, remove) =>
      request<void>(`/mail/messages/${encodeURIComponent(folder)}/${uid}/flags`, {
        method: "PATCH",
        body: JSON.stringify({ add, remove }),
      }),
    move: (folder, uid, target) =>
      request<void>(`/mail/messages/${encodeURIComponent(folder)}/${uid}/move`, {
        method: "PATCH",
        body: JSON.stringify({ target }),
      }),
    remove: (folder, uid) =>
      request<void>(`/mail/messages/${encodeURIComponent(folder)}/${uid}`, { method: "DELETE" }),
    send: (input: SendMessageInput) =>
      request<{ messageId: string }>("/mail/send", {
        method: "POST",
        body: JSON.stringify(input),
      }),

    listContacts: ({ cursor, limit = 50, q }) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (cursor) params.set("cursor", cursor);
      if (q) params.set("q", q);
      return request<Page<Contact>>(`/contacts?${params.toString()}`);
    },
    upsertContact: (input) =>
      request<Contact>("/contacts", { method: "POST", body: JSON.stringify(input) }),
    removeContact: (id) =>
      request<void>(`/contacts/${encodeURIComponent(id)}`, { method: "DELETE" }),
    async diagnostics(): Promise<Diagnostics> {
      const started = Date.now();
      const data = await request<Omit<Diagnostics, "mode"> & { mode?: "live" }>("/health/diagnostics");
      const t = readTokens();
      return {
        ...data,
        mode: "live",
        session: { ...data.session, refreshTokenPresent: Boolean(t?.refreshToken) },
        gateway: { ...data.gateway, uptimeSeconds: data.gateway.uptimeSeconds ?? 0 },
      } as Diagnostics;
      void started;
    },
    testImap: () => request<HealthCheck>("/health/diagnostics/test-imap"),
    testSmtp: () => request<HealthCheck>("/health/diagnostics/test-smtp"),

    subscribe(onEvent) {
      // EventSource does not support custom headers; the gateway accepts the
      // bearer token as a query param for the SSE endpoint as a fallback.
      const t = readTokens();
      if (!t) return () => {};
      const url = `${baseUrl}/events?access_token=${encodeURIComponent(t.accessToken)}`;
      const es = new EventSource(url, { withCredentials: true });
      es.onmessage = (ev) => {
        try {
          onEvent(JSON.parse(ev.data) as SseEvent);
        } catch {
          /* ignore malformed frames */
        }
      };
      return () => es.close();
    },
  };
}
