// Typed contract shared by the mock adapter and the live HTTP adapter.
// Mirrors the NestJS gateway response shapes (see gateway/src/mail/mail.service.ts).

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  /** Gateway-authoritative role; absent in mock mode. */
  role?: "USER" | "COMPANY_ADMIN" | "SUPER_ADMIN";
  email?: string;
  /** False for the platform admin identity, which owns no mailbox. */
  hasMailbox?: boolean;
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

export interface AuditRecord {
  id: string;
  type: string;
  email?: string | null;
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown> | null;
  hash?: string | null;
  prevHash?: string | null;
  createdAt: string;
}

/** Host-resolved public branding served by GET /tenant/branding. */
export interface TenantBrandingPayload {
  id: string | null;
  name?: string;
  hostname?: string;
  host?: string | null;
  status?: string;
  plan?: string;
  primary?: string;
  accent?: string;
  logoUrl?: string;
  faviconUrl?: string;
  welcomeMessage?: string;
  supportEmail?: string;
}

/** GET /tenant/me — the signed-in user's own tenant. */
export interface TenantMe {
  id: string;
  name: string;
  hostname?: string;
  plan?: string;
  status: string;
  mailboxLimit?: number;
  allowedDomains?: string[];
  branding?: Record<string, string> | null;
  role?: "USER" | "COMPANY_ADMIN" | "SUPER_ADMIN";
}

export interface TenantSummary {
  id: string;
  name: string;
  hostname: string;
  allowedDomains: string[];
  plan: string;
  status: string;
  mailboxLimit: number;
  users: number;
  server: string | null;
  autoCreated: boolean;
  createdAt: string;
  branding?: Record<string, string> | null;
  extraDomains: string[];
}

export interface MailServerSummary {
  id: string;
  hostname: string;
  region?: string | null;
  tenants: number;
  status: string;
}

export interface PlatformOverview {
  tenants: TenantSummary[];
  servers: MailServerSummary[];
  totals: { tenants: number; servers: number; users: number };
}

export interface CreateTenantInput {
  slug: string;
  name: string;
  hostname: string;
  allowedDomains: string[];
  plan?: string;
  status?: string;
  mailboxLimit?: number;
  mailServerId?: string;
  adminEmail?: string;
  branding?: Record<string, string>;
  extraDomains?: string[];
}

export interface CreateMailServerInput {
  name: string;
  hostname: string;
  region?: string;
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
  imapTlsServername?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpTlsServername?: string;
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


export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  tenantId: string;
  role: "USER" | "COMPANY_ADMIN" | "SUPER_ADMIN";
}

export interface MailClient {
  login(email: string, password: string, tenantId?: string): Promise<AuthTokens>;
  refresh(): Promise<AuthTokens>;
  logout(): Promise<void>;
  /** Platform super-admin only: change the console password from the sign-in screen. */
  changePlatformAdminPassword(input: { email: string; currentPassword: string; newPassword: string }): Promise<void>;

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

  listAudit(input: { cursor?: string | null; limit?: number }): Promise<Page<AuditRecord>>;

  /** Multi-tenancy (Phase 4). */
  tenantBranding(): Promise<TenantBrandingPayload>;
  tenantMe(): Promise<TenantMe>;
  platformOverview(): Promise<PlatformOverview>;
  createTenant(input: CreateTenantInput): Promise<{ id: string }>;
  setTenantStatus(id: string, status: string): Promise<{ id: string; status: string }>;
  createMailServer(input: CreateMailServerInput): Promise<{ id?: string; name: string }>;
  platformAudit(): Promise<Page<AuditRecord> | AuditRecord[]>;
  getProfile(): Promise<UserProfile>;
  updateProfile(input: { displayName?: string }): Promise<UserProfile>;



  diagnostics(): Promise<Diagnostics>;
  testImap(): Promise<HealthCheck>;
  testSmtp(): Promise<HealthCheck>;

  subscribe(onEvent: (event: SseEvent) => void): () => void;
}
