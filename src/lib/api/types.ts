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
  snippet?: string;
  date: string;
  unread: boolean;
  starred: boolean;
  hasAttachment: boolean;
  threadId?: string;
}

export interface MessageAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
  inline?: boolean;
}

export interface MessageDetail extends MessageListItem {
  cc?: MessageAddress[];
  bcc?: MessageAddress[];
  replyTo?: MessageAddress[];
  bodyText?: string;
  bodyHtml?: string;
  /** Gateway aliases for bodyText / bodyHtml. */
  text?: string;
  html?: string;
  headers: Record<string, string>;
  attachments: MessageAttachment[];
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

export interface HealthCheck {
  ok: boolean;
  latencyMs: number;
  detail?: string;
  meta?: Record<string, unknown>;
}

export interface GatewayInfo {
  status: string;
  version: string;
  environment: string;
  gatewayUrl: string | null;
  uptimeSeconds: number;
  timestamp: string;
}

export interface Diagnostics {
  mode: "mock" | "live";
  gateway: GatewayInfo;
  session: {
    email: string;
    tenantId: string;
    role: string;
    sessionId: string;
    jwtValid: boolean;
    refreshTokenPresent: boolean;
  };
  checks: {
    imapReachable: HealthCheck;
    smtpReachable: HealthCheck;
    database: HealthCheck;
    imapAuth: HealthCheck & { meta?: { capabilities?: string[]; folders?: string[]; folderCount?: number; supportsIdle?: boolean; tls?: boolean } };
    smtpAuth: HealthCheck;
  };
}

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
  downloadAttachment(folder: string, uid: number, part: string): Promise<Blob>;

  listContacts(input: { cursor?: string | null; limit?: number; q?: string }): Promise<Page<Contact>>;
  upsertContact(input: { email: string; name?: string; starred?: boolean }): Promise<Contact>;
  removeContact(id: string): Promise<void>;

  diagnostics(): Promise<Diagnostics>;
  testImap(): Promise<HealthCheck>;
  testSmtp(): Promise<HealthCheck>;

  subscribe(onEvent: (event: SseEvent) => void): () => void;
}
