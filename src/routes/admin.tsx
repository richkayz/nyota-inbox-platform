import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSession } from "@/lib/mock-auth";
import { useTenant } from "@/components/branding/BrandProvider";
import { UserPlus, ShieldCheck, Palette, Globe2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  beforeLoad: ({ location }) => {
    if (typeof window !== "undefined") {
      const s = getSession();
      if (!s) throw redirect({ to: "/login", search: { redirect: location.href } });
      if (s.role !== "company_admin" && s.role !== "super_admin") {
        throw redirect({ to: "/mail" });
      }
    }
  },
  head: () => ({
    meta: [
      { title: "Company Admin — Nyota Inbox" },
      { name: "description", content: "Manage users, branding and domain for your company inbox." },
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
        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="branding">Branding</TabsTrigger>
            <TabsTrigger value="domain">Domain</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-6">
            <Card>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold">Users</h2>
                  <p className="text-xs text-muted-foreground">{MOCK_USERS.length} people in {tenant.name}</p>
                </div>
                <Button size="sm" onClick={() => toast("Invite flow — pending Cloud")}>
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
                        <Button size="sm" variant="ghost" onClick={() => toast(`Edit ${u.name} — pending`)}>Edit</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
                <Button onClick={() => toast.success("Branding saved (mock)")}>Save branding</Button>
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
