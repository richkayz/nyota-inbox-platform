// Mock adapter — satisfies MailClient using the existing in-memory fixtures.
// The UI uses this until VITE_API_MODE=live points at the NestJS gateway.

import { FOLDERS, MESSAGES } from "@/lib/mock-mail";
import type {
  AuthTokens,
  FolderSummary,
  MailClient,
  MessageDetail,
  MessageListItem,
  Page,
  SendMessageInput,
  SseEvent,
} from "./types";

function toFolder(f: (typeof FOLDERS)[number]): FolderSummary {
  const role = (["inbox", "sent", "drafts", "spam", "trash", "archive"] as const).includes(
    f.id as any,
  )
    ? (f.id as FolderSummary["role"])
    : null;
  return {
    path: f.id,
    name: f.name,
    delimiter: "/",
    role,
    totalCount: f.count,
    unreadCount: f.unread,
  };
}

function toItem(m: (typeof MESSAGES)[number], index: number): MessageListItem {
  return {
    uid: index + 1,
    folder: m.folderId,
    from: { name: m.from.name, address: m.from.email },
    to: m.to.map((address) => ({ address })),
    subject: m.subject,
    preview: m.preview,
    date: m.date,
    unread: m.unread,
    starred: m.starred,
    hasAttachment: m.hasAttachment,
  };
}

export function createMockAdapter(): MailClient {
  let subs = new Set<(e: SseEvent) => void>();
  return {
    async login(): Promise<AuthTokens> {
      return { accessToken: "mock", refreshToken: "mock", expiresIn: 900 };
    },
    async refresh(): Promise<AuthTokens> {
      return { accessToken: "mock", refreshToken: "mock", expiresIn: 900 };
    },
    async logout() {},

    async listFolders() {
      return FOLDERS.map(toFolder);
    },

    async listMessages({ folder, cursor, limit = 50 }): Promise<Page<MessageListItem>> {
      const all = MESSAGES.filter((m) => m.folderId === folder || folder === "inbox").map(toItem);
      const start = cursor ? Number(cursor) : 0;
      const slice = all.slice(start, start + limit);
      const nextIndex = start + slice.length;
      return {
        items: slice,
        nextCursor: nextIndex < all.length ? String(nextIndex) : null,
      };
    },

    async getMessage(folder, uid): Promise<MessageDetail> {
      const m = MESSAGES[uid - 1];
      if (!m) throw new Error("Message not found");
      const item = toItem(m, uid - 1);
      return {
        ...item,
        folder,
        bodyText: m.body,
        headers: {},
        attachments: [],
      };
    },

    async setFlags() {},
    async move() {},
    async remove() {},
    async send() {
      return { messageId: `<mock-${crypto.randomUUID?.() ?? Date.now()}@nyota.local>` };
    },

    subscribe(onEvent) {
      subs.add(onEvent);
      return () => {
        subs.delete(onEvent);
      };
    },
  };
}
