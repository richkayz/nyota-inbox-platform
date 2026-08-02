import { createFileRoute, useNavigate, redirect, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSession, getSessionStatus } from "@/lib/mock-auth";
import { loadDraft, loadProvisionedTenants } from "@/lib/onboarding";
import { mailClient, isLiveMode } from "@/lib/api/client";
import type { AuditRecord, PlatformOverview } from "@/lib/api/types";
import { Plus, Server, Building2, Activity, Loader2 } from "lucide-react";



export const Route = createFileRoute("/super-admin/")({
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
    if (s && s.role !== "super_admin") throw redirect({ to: "/mail" });
  },
  head: () => ({
    meta: [
      { title: "Platform Admin — Nyota Inbox" },
      { name: "description", content: "Manage tenants and mail servers across the Nyota Inbox platform." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SuperAdminPage,
});

function SuperAdminPage() {
  const navigate = useNavigate();
  const session = getSession();
  // const [selectedTenant, setSelectedTenant] = useState<any>(null);
  useEffect(() => {
    if (!session) navigate({ to: "/login" });
  }, [session, navigate]);

  const overview = useQuery<PlatformOverview>({
    queryKey: ["platform", "overview"],
    queryFn: () => mailClient.platformOverview(),
    enabled: !!session,
    staleTime: 30_000,
  });

  const audit = useQuery({
    queryKey: ["platform", "audit"],
    queryFn: async () => {
      const res = await mailClient.platformAudit();
      return (Array.isArray(res) ? res : res.items) as AuditRecord[];
    },
    enabled: !!session,
    staleTime: 30_000,
  });

  if (!session) return null;

  // Locally provisioned drafts (wizard) are shown until the gateway confirms them.
  const gatewayTenants = overview.data?.tenants ?? [];
  const knownIds = new Set(gatewayTenants.map((t) => t.id));
  const onboarded = loadProvisionedTenants()
    .filter((d) => !knownIds.has(d.slug))
    .map((d) => ({
      id: d.slug,
      name: d.companyName,
      hostname: d.hostname,
      server: d.mailServerId,
      plan: d.plan,
      users: d.mailboxes.length,
      status: "provisioning",
    }));
  const tenants = gatewayTenants.map((t) => ({
    id: t.id,
    name: t.name,
    hostname: t.hostname,
    server: t.server,
    plan: t.plan,
    users: t.users,
    status: t.status,
  }));
  const servers = overview.data?.servers ?? [];

  return (
    <AppShell title="Platform Admin">
      <div className="mx-auto max-w-6xl p-6">
        {overview.isError && (
          <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            Could not load platform data from the gateway. {(overview.error as Error)?.message}
          </div>
        )}
      
      

      <div className="mb-6 grid gap-4 md:grid-cols-4">
          <Stat
            icon={Building2}
            label="Customers"
            value={tenants.length.toString()}
            loading={overview.isLoading}
          />

          <Stat
            icon={Server}
            label="Mail Servers"
            value={servers.length.toString()}
            loading={overview.isLoading}
          />

          <Stat
            icon={Activity}
            label="Mailboxes"
            value={tenants.reduce((a, t) => a + t.users, 0).toString()}
            loading={overview.isLoading}
          />

          <Stat
            icon={Activity}
            label="Active Accounts"
            value={tenants.filter((t) => t.status === "active").length.toString()}
            loading={overview.isLoading}
          />
      </div>



        <Tabs defaultValue="tenants">
          <TabsList>
            <TabsTrigger value="tenants">Tenants</TabsTrigger>
            <TabsTrigger value="servers">Mail servers</TabsTrigger>
            <TabsTrigger value="audit">Audit log</TabsTrigger>
          </TabsList>

          <TabsContent value="tenants" className="mt-6">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold">Tenants</h2>
                <OnboardWizard />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Hostname</TableHead>
                    <TableHead>Mail server</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Users</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="font-mono text-xs">{t.hostname}</TableCell>
                      <TableCell className="font-mono text-xs">{t.server}</TableCell>
                      <TableCell><Badge variant="outline">{t.plan}</Badge></TableCell>
                      <TableCell>{t.users}</TableCell>
                      <TableCell>
                        <Badge variant={t.status === "active" ? "default" : "secondary"}>{t.status}</Badge>
                      </TableCell>
                      <TableCell>
                         <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                                navigate({
                                  to: "/super-admin/$tenantId",
                                  params: {
                                    tenantId: t.id,
                                  },
                                })
                              }
                          >
                            Manage
                          </Button>
                        </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="servers" className="mt-6">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold">Mail servers</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Hostname</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Tenants</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {servers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-sm text-muted-foreground">
                        {overview.isLoading ? "Loading mail servers…" : "No mail servers registered yet."}
                      </TableCell>
                    </TableRow>
                  )}
                  {servers.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.id}</TableCell>
                      <TableCell className="font-mono text-xs">{s.hostname}</TableCell>
                      <TableCell>{s.region ?? "—"}</TableCell>
                      <TableCell>{s.tenants}</TableCell>
                      <TableCell>
                        <Badge variant={s.status === "healthy" ? "default" : "destructive"}>{s.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="audit" className="mt-6">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold">Audit log</h2>
              <ul className="space-y-3 font-mono text-xs">
                {(audit.data ?? []).map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center gap-3 border-b border-border pb-2 last:border-0">
                    <span className="text-muted-foreground">
                      {new Date(row.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span>{row.email ?? row.userId ?? "system"}</span>
                    <Badge variant="outline" className="font-mono">{row.type}</Badge>
                    {row.ip && <span className="text-muted-foreground">→ {row.ip}</span>}
                  </li>
                ))}
                {(audit.data ?? []).length === 0 && (
                  <li className="text-muted-foreground">
                    {audit.isLoading ? "Loading audit events…" : "No platform audit events yet."}
                  </li>
                )}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">
                {isLiveMode
                  ? "Append-only, hash-chained rows served by the gateway."
                  : "Mock mode — connect the gateway to see real audit events."}
              </p>
            </div>
          </TabsContent>

        </Tabs>
      </div>
    </AppShell>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: typeof Server;
  label: string;
  value: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold">
            {loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : value}
          </div>
        </div>
      </div>

    </div>
  );
}

function OnboardWizard() {
  const draft = typeof window === "undefined" ? null : loadDraft();
  const inProgress = draft && draft.companyName;
  return (
    <div className="flex items-center gap-2">
      {inProgress && (
        <Badge variant="secondary" className="hidden sm:inline-flex">
          Draft: {draft!.companyName} · step {draft!.step}/5
        </Badge>
      )}
      <Button asChild size="sm">
        <Link to="/onboarding">
          <Plus className="mr-1 h-4 w-4" /> {inProgress ? "Resume onboarding" : "Onboard tenant"}
        </Link>
      </Button>
    </div>
  );
}

