// Typed contract shared by the mock adapter and the live HTTP adapter.
// Mirrors the NestJS gateway response shapes (see gateway/src/mail/mail.service.ts).

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface FolderSummary {
  path: string;
  name: string;
  delimiter: string;
  role: "inbox" | "sent" | "drafts" | "spam" | "trash" | "archive" | null;
  totalCount: number;
  unreadCount: number;
}

export interface MessageAddress {
  name?: string;
  address: string;
}

export interface MessageListItem {
  uid: number;
  folder: string;
  from: MessageAddress;
  to: MessageAddress[];
  subject: string;
  preview: string;
  date: string;
  unread: boolean;
  starred: boolean;
  hasAttachment: boolean;
  threadId?: string;
}

export interface MessageDetail extends MessageListItem {
  bodyText?: string;
  bodyHtml?: string;
  headers: Record<string, string>;
  attachments: Array<{ id: string; filename: string; contentType: string; size: number }>;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface SendMessageInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: Array<{ filename: string; content: string; contentType?: string }>;
}

export interface Contact {
  id: string;
  email: string;
  name?: string | null;
  starred: boolean;
  createdAt?: string;
}

export type SseEvent =
  | { type: "mail.new"; folder: string; count: number }
  | { type: "mail.expunge"; folder: string; seq: number }
  | { type: "mail.flags"; folder: string; seq: number; flags: string[] }
  | { type: "ping"; at: number };

export interface MailClient {
  login(email: string, password: string, tenantId?: string): Promise<AuthTokens>;
  refresh(): Promise<AuthTokens>;
  logout(): Promise<void>;

  listFolders(): Promise<FolderSummary[]>;
  listMessages(input: { folder: string; cursor?: string | null; limit?: number; q?: string }): Promise<Page<MessageListItem>>;
  getMessage(folder: string, uid: number): Promise<MessageDetail>;
  setFlags(folder: string, uid: number, add: string[], remove: string[]): Promise<void>;
  move(folder: string, uid: number, target: string): Promise<void>;
  remove(folder: string, uid: number): Promise<void>;
  send(input: SendMessageInput): Promise<{ messageId: string }>;

  listContacts(input: { cursor?: string | null; limit?: number; q?: string }): Promise<Page<Contact>>;
  upsertContact(input: { email: string; name?: string; starred?: boolean }): Promise<Contact>;
  removeContact(id: string): Promise<void>;

  subscribe(onEvent: (event: SseEvent) => void): () => void;
}
