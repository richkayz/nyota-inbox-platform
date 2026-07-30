import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getSession, getSessionStatus } from "@/lib/mock-auth";
import { Plus, Server, Building2, Activity } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/super-admin")({
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

const TENANTS = [
  { id: "nyota", name: "Nyota One", hostname: "inbox.nyota.one", users: 42, server: "plesk-eu-1", plan: "Business", status: "active" },
  { id: "acme", name: "Acme Corp", hostname: "inbox.acme.com", users: 128, server: "plesk-eu-2", plan: "Enterprise", status: "active" },
  { id: "orbit", name: "Orbit Labs", hostname: "inbox.orbit.io", users: 17, server: "plesk-us-1", plan: "Starter", status: "trial" },
];

const SERVERS = [
  { id: "plesk-eu-1", hostname: "mail-eu-1.plesk.io", region: "EU-West", tenants: 1, uptime: "99.98%", status: "healthy" },
  { id: "plesk-eu-2", hostname: "mail-eu-2.plesk.io", region: "EU-Central", tenants: 1, uptime: "99.99%", status: "healthy" },
  { id: "plesk-us-1", hostname: "mail-us-1.plesk.io", region: "US-East", tenants: 1, uptime: "99.90%", status: "degraded" },
];

function SuperAdminPage() {
  const navigate = useNavigate();
  const session = getSession();
  useEffect(() => {
    if (!session) navigate({ to: "/login" });
  }, [session, navigate]);
  if (!session) return null;

  return (
    <AppShell title="Platform Admin">
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Stat icon={Building2} label="Tenants" value={TENANTS.length.toString()} />
          <Stat icon={Server} label="Mail servers" value={SERVERS.length.toString()} />
          <Stat icon={Activity} label="Active users" value={TENANTS.reduce((a, t) => a + t.users, 0).toString()} />
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {TENANTS.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="font-mono text-xs">{t.hostname}</TableCell>
                      <TableCell className="font-mono text-xs">{t.server}</TableCell>
                      <TableCell><Badge variant="outline">{t.plan}</Badge></TableCell>
                      <TableCell>{t.users}</TableCell>
                      <TableCell>
                        <Badge variant={t.status === "active" ? "default" : "secondary"}>{t.status}</Badge>
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
                    <TableHead>ID</TableHead>
                    <TableHead>Hostname</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Tenants</TableHead>
                    <TableHead>Uptime</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SERVERS.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.id}</TableCell>
                      <TableCell className="font-mono text-xs">{s.hostname}</TableCell>
                      <TableCell>{s.region}</TableCell>
                      <TableCell>{s.tenants}</TableCell>
                      <TableCell>{s.uptime}</TableCell>
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
                {[
                  { t: "12:41", who: "super@nyota.one", what: "tenant.create", target: "orbit.io" },
                  { t: "12:14", who: "amara@nyota.one", what: "user.invite", target: "lucas@nyota.one" },
                  { t: "10:02", who: "system", what: "mail-server.health", target: "plesk-us-1 → degraded" },
                  { t: "09:58", who: "david@nyota.one", what: "auth.login", target: "203.0.113.42" },
                ].map((row, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-3 border-b border-border pb-2 last:border-0">
                    <span className="text-muted-foreground">{row.t}</span>
                    <span>{row.who}</span>
                    <Badge variant="outline" className="font-mono">{row.what}</Badge>
                    <span className="text-muted-foreground">→ {row.target}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">Real impl: append-only, hash-chained rows in Postgres.</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Server; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold">{value}</div>
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

