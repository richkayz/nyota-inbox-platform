import { createFileRoute, useNavigate, redirect, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getSession, getSessionStatus } from "@/lib/mock-auth";
import { getAuditEntries, auditEventLabel, type AuditEntry } from "@/lib/audit-log";
import { useTenant } from "@/components/branding/BrandProvider";
import { useAuditLogInfinite, useContactsInfinite, useDiagnostics, useFolders } from "@/lib/api/queries";
import { isLiveMode } from "@/lib/api/client";
import {
  UserPlus,
  ShieldCheck,
  Palette,
  Globe2,
  CheckCircle2,
  ScrollText,
  Inbox as InboxIcon,
  MailCheck,
  Users,
  Activity,
  AlertTriangle,
  Stethoscope,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  beforeLoad: ({ location }) => {
    if (typeof window === "undefined") return;
    const status = getSessionStatus();
    if (status !== "active") {
      throw redirect({
        to: "/login",
        search: { redirect: location.href, ...(status === "expired" ? { reason: "expired" as const } : {}) },
      });
    }
    const s = getSession();
    if (s && s.role !== "company_admin" && s.role !== "super_admin") {
      throw redirect({ to: "/mail" });
    }
  },
  head: () => ({
    meta: [
      { title: "Company Admin — Nyota Inbox" },
      { name: "description", content: "Company dashboard, mailbox users, branding, domain and audit log for your Nyota Inbox tenant." },
      { property: "og:title", content: "Company Admin — Nyota Inbox" },
      { property: "og:description", content: "Dashboard, mailboxes, branding and audit log for your company inbox." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

const MOCK_USERS = [
  { email: "amara@nyota.one", name: "Amara Okafor", role: "company_admin", status: "active" },
  { email: "david@nyota.one", name: "David Chen", role: "user", status: "active" },
  { email: "priya@nyota.one", name: "Priya Sharma", role: "user", status: "active" },
  { email: "lucas@nyota.one", name: "Lucas Meyer", role: "user", status: "invited" },
];

function AdminPage() {
  const navigate = useNavigate();
  const session = getSession();
  const tenant = useTenant();
  useEffect(() => {
    if (!session) navigate({ to: "/login" });
    else if (session.role === "user") navigate({ to: "/mail" });
  }, [session, navigate]);

  if (!session || session.role === "user") return null;

  return (
    <AppShell title="Company Admin">
      <div className="mx-auto max-w-5xl p-6">
        <Tabs defaultValue="dashboard">
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="branding">Branding</TabsTrigger>
            <TabsTrigger value="domain">Domain</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="audit">Audit log</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6">
            <DashboardTab tenantId={tenant.id} tenantName={tenant.name} />
          </TabsContent>

          <TabsContent value="users" className="mt-6">
            <Card>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold">Users</h2>
                  <p className="text-xs text-muted-foreground">{MOCK_USERS.length} people in {tenant.name}</p>
                </div>
                <Button size="sm" onClick={() => toast("Mailbox provisioning requires the Plesk API endpoints")}>
                  <UserPlus className="mr-1 h-4 w-4" /> Invite user
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MOCK_USERS.map((u) => (
                    <TableRow key={u.email}>
                      <TableCell>
                        <div className="font-medium">{u.name}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.role === "company_admin" ? "default" : "secondary"}>{u.role.replace("_", " ")}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.status === "active" ? "outline" : "secondary"}>{u.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => toast(`Edit ${u.name} — pending Plesk provisioning`)}>Edit</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-4 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                Mailbox creation, suspension and quota changes are performed against Plesk. Until those
                gateway endpoints are enabled this list is a placeholder — sign-in itself already
                authenticates against your live Dovecot mailboxes.
              </p>
            </Card>
          </TabsContent>

          <TabsContent value="branding" className="mt-6">
            <Card>
              <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
                <Palette className="h-4 w-4" /> Branding
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Company name</Label>
                  <Input defaultValue={tenant.name} />
                </div>
                <div className="space-y-2">
                  <Label>Welcome message</Label>
                  <Input defaultValue={tenant.welcomeMessage} />
                </div>
                <div className="space-y-2">
                  <Label>Primary color</Label>
                  <div className="flex gap-2">
                    <div className="h-9 w-9 rounded-md border border-border" style={{ background: "var(--primary)" }} />
                    <Input defaultValue={tenant.primary} className="font-mono text-xs" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Accent color</Label>
                  <div className="flex gap-2">
                    <div className="h-9 w-9 rounded-md border border-border" style={{ background: "var(--accent)" }} />
                    <Input defaultValue={tenant.accent} className="font-mono text-xs" />
                  </div>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Logo</Label>
                  <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                    Drop an SVG or PNG here, or <button className="ml-1 text-primary hover:underline">browse</button>
                  </div>
                </div>
              </div>
              <div className="mt-5 flex justify-end">
                <Button onClick={() => toast.success("Branding saved (local)")}>Save branding</Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="domain" className="mt-6">
            <Card>
              <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
                <Globe2 className="h-4 w-4" /> Custom domain
              </h2>
              <p className="mb-4 text-xs text-muted-foreground">Route your team to inbox.your-company.com</p>
              <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4 text-sm">
                <div>
                  <div className="text-xs font-semibold text-muted-foreground">Current</div>
                  <div className="font-mono">{tenant.hostname}</div>
                </div>
                <div className="rounded-md bg-card p-3">
                  <div className="text-xs font-semibold">DNS record required</div>
                  <div className="mt-1 flex flex-wrap gap-2 font-mono text-xs">
                    <span className="rounded bg-muted px-2 py-1">CNAME</span>
                    <span>inbox.your-company.com</span>
                    <span>→</span>
                    <span>tenants.nyota.one</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Verified · TLS certificate active
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="mt-6">
            <Card>
              <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
                <ShieldCheck className="h-4 w-4" /> Security posture
              </h2>
              <ul className="space-y-3 text-sm">
                <SecurityRow label="Force 2FA for all users" enabled={false} />
                <SecurityRow label="Restrict sign-in to allowed IPs" enabled={false} />
                <SecurityRow label="Session lifetime: 12 hours" enabled />
                <SecurityRow label="Audit log retention: 365 days" enabled />
              </ul>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="mt-6">
            <AuditLogTab tenantId={tenant.id} tenantName={tenant.name} />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">{children}</div>;
}

function SecurityRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <li className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0">
      <span>{label}</span>
      <Badge variant={enabled ? "default" : "secondary"}>{enabled ? "On" : "Off"}</Badge>
    </li>
  );
}

/* ------------------------------- Dashboard ------------------------------- */

function DashboardTab({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const folders = useFolders();
  const contacts = useContactsInfinite();
  const diagnostics = useDiagnostics();
  const audit = useAuditLogInfinite(isLiveMode);

  const totals = useMemo(() => {
    const list = folders.data ?? [];
    const byRole = (role: string) => list.find((f) => f.role === role);
    const inbox = byRole("inbox");
    const sent = byRole("sent");
    return {
      messages: list.reduce((n, f) => n + (f.totalCount ?? 0), 0),
      unread: inbox?.unreadCount ?? list.reduce((n, f) => n + (f.unreadCount ?? 0), 0),
      inbox: inbox?.totalCount ?? 0,
      sent: sent?.totalCount ?? 0,
    };
  }, [folders.data]);

  const contactCount = contacts.data?.pages.reduce((n, p) => n + p.items.length, 0) ?? 0;

  const localEvents = useMemo(() => getAuditEntries(tenantId, 6), [tenantId]);
  const recent = (audit.data?.pages[0]?.items ?? []).slice(0, 6);

  const checks = diagnostics.data?.checks;
  const health = checks
    ? [
        { label: "IMAP (Dovecot)", ok: checks.imapAuth.ok || checks.imapReachable.ok },
        { label: "SMTP (Postfix)", ok: checks.smtpAuth.ok || checks.smtpReachable.ok },
        { label: "Database", ok: checks.database.ok },
      ]
    : [];
  const degraded = health.filter((h) => !h.ok);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Messages stored on server" value={totals.messages} icon={InboxIcon} loading={folders.isLoading} />
        <Stat label="Unread in Inbox" value={totals.unread} icon={AlertTriangle} loading={folders.isLoading} />
        <Stat label="Sent items" value={totals.sent} icon={MailCheck} loading={folders.isLoading} />
        <Stat label="Contacts" value={contactCount} icon={Users} loading={contacts.isLoading} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Stethoscope className="h-4 w-4" /> Mail server health
            </h2>
            <Link to="/settings/diagnostics" className="text-xs text-primary hover:underline">
              Diagnostics
            </Link>
          </div>
          {diagnostics.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-2/3" />
            </div>
          ) : diagnostics.isError ? (
            <p className="text-sm text-muted-foreground">Could not reach the gateway health endpoint.</p>
          ) : (
            <>
              <ul className="space-y-3 text-sm">
                {health.map((h) => (
                  <li key={h.label} className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0">
                    <span>{h.label}</span>
                    <Badge variant={h.ok ? "default" : "destructive"}>{h.ok ? "Healthy" : "Attention"}</Badge>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">
                Mode: {diagnostics.data?.mode ?? "—"} · gateway v{diagnostics.data?.gateway.version ?? "—"}
                {degraded.length > 0 ? ` · ${degraded.length} check(s) need attention` : " · all systems nominal"}
              </p>
            </>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Activity className="h-4 w-4" /> Recent activity
            </h2>
            <span className="text-xs text-muted-foreground">{tenantName}</span>
          </div>
          {isLiveMode ? (
            audit.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-4/5" />
                <Skeleton className="h-5 w-3/5" />
              </div>
            ) : recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No server-side events recorded yet.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {recent.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                    <div>
                      <div className="font-medium">{auditEventLabel(e.type as AuditEntry["type"]) ?? e.type}</div>
                      <div className="text-xs text-muted-foreground">{e.email ?? "—"}</div>
                    </div>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : localEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No local events recorded yet.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {localEvents.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                  <div>
                    <div className="font-medium">{auditEventLabel(e.type)}</div>
                    <div className="text-xs text-muted-foreground">{e.email ?? "—"}</div>
                  </div>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(e.at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  loading,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-20" />
      ) : (
        <div className="mt-2 text-3xl font-semibold tabular-nums">{value.toLocaleString()}</div>
      )}
    </div>
  );
}

/* ------------------------------- Audit log ------------------------------- */

function AuditLogTab({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const server = useAuditLogInfinite(isLiveMode);
  const [localEntries, setLocalEntries] = useState<AuditEntry[]>(() => getAuditEntries(tenantId, 200));
  const [filter, setFilter] = useState<string>("all");

  const rows = isLiveMode
    ? (server.data?.pages.flatMap((p) => p.items) ?? []).map((e) => ({
        id: e.id,
        at: e.createdAt,
        type: e.type,
        email: e.email ?? undefined,
        userAgent: e.userAgent ?? undefined,
      }))
    : localEntries.map((e) => ({ id: e.id, at: e.at, type: e.type as string, email: e.email, userAgent: e.userAgent }));

  const visible = filter === "all" ? rows : rows.filter((r) => r.type === filter);

  function refresh() {
    if (isLiveMode) server.refetch();
    else setLocalEntries(getAuditEntries(tenantId, 200));
  }

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <ScrollText className="h-4 w-4" /> Audit log
          </h2>
          <p className="text-xs text-muted-foreground">
            {isLiveMode ? "Hash-chained gateway events" : "Local browser events"} for {tenantName} · {rows.length} loaded
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="all">All events</option>
            <option value="login.success">Sign in</option>
            <option value="login.failure">Sign-in failed</option>
            <option value="logout">Sign out</option>
            <option value="session.expired">Session expired</option>
            <option value="mail.send">Mail sent</option>
          </select>
          <Button size="sm" variant="outline" onClick={refresh} disabled={server.isFetching}>
            Refresh
          </Button>
        </div>
      </div>

      {isLiveMode && server.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : isLiveMode && server.isError ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Could not load the audit log. Company admin role is required on the gateway.
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No events recorded yet. Sign in, send mail, or let a session expire to see entries here.
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Device</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(e.at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={eventBadgeVariant(e.type)}>
                      {auditEventLabel(e.type as AuditEntry["type"]) ?? e.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{e.email ?? "—"}</TableCell>
                  <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground" title={e.userAgent}>
                    {shortUserAgent(e.userAgent)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {isLiveMode && server.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button
                size="sm"
                variant="outline"
                onClick={() => server.fetchNextPage()}
                disabled={server.isFetchingNextPage}
              >
                {server.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function eventBadgeVariant(type: string): "default" | "secondary" | "destructive" | "outline" {
  switch (type) {
    case "login.success":
      return "default";
    case "logout":
      return "secondary";
    case "session.expired":
    case "login.failure":
      return "destructive";
    default:
      return "outline";
  }
}

function shortUserAgent(ua?: string): string {
  if (!ua) return "—";
  const m = ua.match(/(Chrome|Firefox|Safari|Edg|OPR)\/[\d.]+/);
  const os = ua.match(/\(([^)]+)\)/)?.[1]?.split(";")[0]?.trim();
  return [m?.[0], os].filter(Boolean).join(" · ") || ua.slice(0, 60);
}
