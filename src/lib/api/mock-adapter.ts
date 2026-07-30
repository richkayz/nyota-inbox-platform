// Stateful in-memory mock adapter. Fully satisfies MailClient so the UI can
// be developed and demoed without the NestJS gateway. Mutations (flags, move,
// remove, send, contacts) update the store and are reflected on re-fetch,
// which makes optimistic-update rollback behave correctly.

import type {
  AuthTokens,
  Contact,
  FolderSummary,
  MailClient,
  MessageDetail,
  MessageListItem,
  Page,
  SendMessageInput,
  SseEvent,
} from "./types";

const FOLDERS_DEF: Array<{ path: string; name: string; role: FolderSummary["role"] }> = [
  { path: "inbox", name: "Inbox", role: "inbox" },
  { path: "starred", name: "Starred", role: null },
  { path: "sent", name: "Sent", role: "sent" },
  { path: "drafts", name: "Drafts", role: "drafts" },
  { path: "spam", name: "Spam", role: "spam" },
  { path: "trash", name: "Trash", role: "trash" },
  { path: "archive", name: "Archive", role: "archive" },
];

const SENDERS = [
  { name: "Amara Okafor", address: "amara@nyota.one" },
  { name: "David Chen", address: "d.chen@partner.com" },
  { name: "Priya Sharma", address: "priya@design.studio" },
  { name: "Lucas Meyer", address: "lucas@finance.co" },
  { name: "Sofia Ricci", address: "s.ricci@legal.eu" },
  { name: "Kwame Boateng", address: "kwame@ops.africa" },
  { name: "Naomi Tanaka", address: "naomi@growth.jp" },
  { name: "Elena Popescu", address: "elena@partners.io" },
];

const SUBJECTS = [
  "Q4 pipeline review — action items",
  "Contract v3 attached for signature",
  "Design system rollout: phase 2",
  "Re: Server migration window",
  "Payroll approval needed by Friday",
  "Welcome to the team 🎉",
  "Weekly ops digest",
  "Board deck draft — please review",
  "Vendor renewal: 45 days out",
  "Support ticket #4821 escalated",
  "Inbound demo request",
  "Security review sign-off",
];

const PREVIEWS = [
  "Following up on our conversation earlier. I've drafted a plan that covers…",
  "Attached is the revised contract with the changes we agreed. Please sign…",
  "The rollout for the next set of teams begins Monday. Below is the checklist…",
  "Confirming the maintenance window is scheduled for Saturday 02:00 UTC…",
  "Please approve the November payroll batch before end of day Friday…",
  "So glad to have you on board — here's everything you need for day one…",
];

interface Store {
  seq: number;
  messages: Map<number, MessageDetail>;
  contacts: Contact[];
}

function seedStore(): Store {
  const messages = new Map<number, MessageDetail>();
  for (let i = 0; i < 128; i++) {
    const sender = SENDERS[i % SENDERS.length];
    const uid = i + 1;
    // Distribute across folders — most in inbox, some in sent/spam/trash.
    const folder =
      i % 17 === 0 ? "spam" : i % 13 === 0 ? "trash" : i % 11 === 0 ? "sent" : "inbox";
    const preview = PREVIEWS[i % PREVIEWS.length];
    const body = `${preview}\n\nLet me know your thoughts when you get a chance.\n\nBest,\n${sender.name}`;
    messages.set(uid, {
      uid,
      folder,
      from: folder === "sent" ? { name: "You", address: "you@nyota.one" } : sender,
      to: folder === "sent" ? [{ address: sender.address, name: sender.name }] : [{ address: "you@nyota.one" }],
      subject: SUBJECTS[i % SUBJECTS.length],
      preview,
      bodyText: body,
      date: new Date(Date.now() - i * 0.35 * 86_400_000).toISOString(),
      unread: folder === "inbox" && i < 6,
      starred: i % 7 === 0,
      hasAttachment: i % 3 === 0,
      headers: {},
      attachments:
        i % 3 === 0
          ? [{ id: `att-${uid}`, filename: `document-${uid}.pdf`, contentType: "application/pdf", size: 128_512 }]
          : [],
    });
  }
  const contacts: Contact[] = SENDERS.map((s, i) => ({
    id: `c${i + 1}`,
    email: s.address,
    name: s.name,
    starred: i < 2,
    createdAt: new Date(Date.now() - i * 86_400_000).toISOString(),
  }));
  return { seq: messages.size, messages, contacts };
}

const store: Store = seedStore();
const subs = new Set<(e: SseEvent) => void>();

function emit(event: SseEvent) {
  for (const fn of subs) fn(event);
}

function toItem(m: MessageDetail): MessageListItem {
  return {
    uid: m.uid,
    folder: m.folder,
    from: m.from,
    to: m.to,
    subject: m.subject,
    preview: m.preview,
    date: m.date,
    unread: m.unread,
    starred: m.starred,
    hasAttachment: m.hasAttachment,
  };
}

function delay(ms = 180) {
  return new Promise((r) => setTimeout(r, ms));
}

export function createMockAdapter(): MailClient {
  return {
    async login(): Promise<AuthTokens> {
      await delay(300);
      return { accessToken: "mock", refreshToken: "mock", expiresIn: 900 };
    },
    async refresh(): Promise<AuthTokens> {
      return { accessToken: "mock", refreshToken: "mock", expiresIn: 900 };
    },
    async logout() {},

    async listFolders() {
      await delay();
      return FOLDERS_DEF.map((f) => {
        let total = 0;
        let unread = 0;
        for (const m of store.messages.values()) {
          const matches =
            f.path === "starred"
              ? m.starred && m.folder !== "trash" && m.folder !== "spam"
              : m.folder === f.path;
          if (matches) {
            total++;
            if (m.unread) unread++;
          }
        }
        return {
          path: f.path,
          name: f.name,
          delimiter: "/",
          role: f.role,
          totalCount: total,
          unreadCount: unread,
        };
      });
    },

    async listMessages({ folder, cursor, limit = 30, q }): Promise<Page<MessageListItem>> {
      await delay();
      const query = q?.trim().toLowerCase();
      const all = [...store.messages.values()]
        .filter((m) => {
          if (folder === "starred") return m.starred && m.folder !== "trash" && m.folder !== "spam";
          return m.folder === folder;
        })
        .filter((m) => {
          if (!query) return true;
          return (
            m.subject.toLowerCase().includes(query) ||
            m.preview.toLowerCase().includes(query) ||
            (m.from.name ?? "").toLowerCase().includes(query) ||
            m.from.address.toLowerCase().includes(query)
          );
        })
        .sort((a, b) => b.date.localeCompare(a.date));
      const start = cursor ? Number(cursor) : 0;
      const slice = all.slice(start, start + limit).map(toItem);
      const next = start + slice.length;
      return { items: slice, nextCursor: next < all.length ? String(next) : null };
    },

    async getMessage(folder, uid): Promise<MessageDetail> {
      await delay();
      const m = store.messages.get(uid);
      if (!m || (m.folder !== folder && !(folder === "starred" && m.starred))) {
        throw new Error("Message not found");
      }
      return m;
    },

    async downloadAttachment() {
      await delay(120);
      return new Blob(["mock attachment"], { type: "text/plain" });
    },


    async setFlags(_folder, uid, add, remove) {
      await delay(80);
      const m = store.messages.get(uid);
      if (!m) return;
      if (add.includes("\\Seen")) m.unread = false;
      if (remove.includes("\\Seen")) m.unread = true;
      if (add.includes("\\Flagged")) m.starred = true;
      if (remove.includes("\\Flagged")) m.starred = false;
    },

    async move(_folder, uid, target) {
      await delay(80);
      const m = store.messages.get(uid);
      if (!m) return;
      m.folder = target;
    },

    async remove(_folder, uid) {
      await delay(80);
      const m = store.messages.get(uid);
      if (!m) return;
      if (m.folder === "trash") store.messages.delete(uid);
      else m.folder = "trash";
    },

    async send(input: SendMessageInput) {
      await delay(400);
      const uid = ++store.seq;
      const now = new Date().toISOString();
      const preview = (input.text ?? input.subject).slice(0, 140);
      store.messages.set(uid, {
        uid,
        folder: "sent",
        from: { name: "You", address: "you@nyota.one" },
        to: input.to.map((address) => ({ address })),
        subject: input.subject,
        preview,
        bodyText: input.text,
        bodyHtml: input.html,
        date: now,
        unread: false,
        starred: false,
        hasAttachment: (input.attachments?.length ?? 0) > 0,
        headers: {},
        attachments:
          input.attachments?.map((a, i) => ({
            id: `att-${uid}-${i}`,
            filename: a.filename,
            contentType: a.contentType ?? "application/octet-stream",
            size: Math.floor((a.content?.length ?? 0) * 0.75),
          })) ?? [],
      });
      emit({ type: "mail.new", folder: "sent", count: 1 });
      return { messageId: `<mock-${uid}@nyota.local>` };
    },

    async listContacts({ cursor, limit = 50, q }): Promise<Page<Contact>> {
      await delay(120);
      const query = q?.trim().toLowerCase();
      const all = store.contacts
        .filter(
          (c) =>
            !query ||
            c.email.toLowerCase().includes(query) ||
            (c.name ?? "").toLowerCase().includes(query),
        )
        .sort((a, b) => {
          if (a.starred !== b.starred) return a.starred ? -1 : 1;
          return (a.name ?? a.email).localeCompare(b.name ?? b.email);
        });
      const start = cursor ? Number(cursor) : 0;
      const slice = all.slice(start, start + limit);
      const next = start + slice.length;
      return { items: slice, nextCursor: next < all.length ? String(next) : null };
    },

    async upsertContact({ email, name, starred }) {
      await delay(80);
      const existing = store.contacts.find((c) => c.email === email);
      if (existing) {
        if (name !== undefined) existing.name = name;
        if (starred !== undefined) existing.starred = starred;
        return existing;
      }
      const c: Contact = {
        id: `c${store.contacts.length + 1}-${Date.now()}`,
        email,
        name: name ?? null,
        starred: starred ?? false,
        createdAt: new Date().toISOString(),
      };
      store.contacts.push(c);
      return c;
    },

    async removeContact(id) {
      await delay(60);
      const i = store.contacts.findIndex((c) => c.id === id);
      if (i >= 0) store.contacts.splice(i, 1);
    },

    async listAudit() {
      await delay(80);
      return { items: [], nextCursor: null };
    },


    async diagnostics() {
      await delay(120);
      const now = new Date().toISOString();
      return {
        mode: "mock" as const,
        gateway: {
          status: "ok",
          version: "0.0.0-mock",
          environment: "mock",
          gatewayUrl: null,
          uptimeSeconds: Math.round(performance.now() / 1000),
          timestamp: now,
        },
        session: {
          email: "mock@nyota.local",
          tenantId: "mock",
          role: "user",
          sessionId: "mock-session",
          jwtValid: false,
          refreshTokenPresent: false,
        },
        checks: {
          imapReachable: { ok: false, latencyMs: 0, detail: "Mock mode — no gateway configured" },
          smtpReachable: { ok: false, latencyMs: 0, detail: "Mock mode — no gateway configured" },
          database: { ok: false, latencyMs: 0, detail: "Mock mode — no gateway configured" },
          imapAuth: { ok: false, latencyMs: 0, detail: "Mock mode — no real IMAP server", meta: {} },
          smtpAuth: { ok: false, latencyMs: 0, detail: "Mock mode — no real SMTP server" },
        },
      };
    },
    async testImap() {
      await delay(200);
      return { ok: false, latencyMs: 0, detail: "Mock mode — set VITE_API_MODE=live to run a real IMAP LOGIN" };
    },
    async testSmtp() {
      await delay(200);
      return { ok: false, latencyMs: 0, detail: "Mock mode — set VITE_API_MODE=live to run a real SMTP verify" };
    },

    subscribe(onEvent) {
      subs.add(onEvent);
      return () => {
        subs.delete(onEvent);
      };
    },
  };
}
