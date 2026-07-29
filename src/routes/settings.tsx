import { createFileRoute, useNavigate, redirect, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { getSession, getSessionStatus } from "@/lib/mock-auth";
import { useTheme } from "@/components/theme/ThemeProvider";
import { toast } from "sonner";
import { Activity } from "lucide-react";

export const Route = createFileRoute("/settings")({
  beforeLoad: ({ location }) => {
    if (typeof window === "undefined") return;
    const status = getSessionStatus();
    if (status !== "active") {
      throw redirect({
        to: "/login",
        search: { redirect: location.href, ...(status === "expired" ? { reason: "expired" as const } : {}) },
      });
    }
  },
  head: () => ({
    meta: [
      { title: "Settings — Nyota Inbox" },
      { name: "description", content: "Manage your Nyota Inbox account, signature, appearance and security." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const session = getSession();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (!session) navigate({ to: "/login" });
  }, [session, navigate]);

  const [displayName, setDisplayName] = useState(session?.displayName ?? "");
  const [signature, setSignature] = useState(`Best,\n${session?.displayName ?? ""}`);
  const [autoSign, setAutoSign] = useState(true);
  const [twoFactor, setTwoFactor] = useState(false);

  if (!session) return null;

  return (
    <AppShell title="Settings">
      <div className="mx-auto max-w-3xl p-6">
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="signature">Signature</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-4">
            <Section title="Profile" description="How you appear to colleagues and recipients.">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={session.email} disabled />
                <p className="text-xs text-muted-foreground">Bound to your mailbox on the Plesk server.</p>
              </div>
              <div className="space-y-2">
                <Label>Display name</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </div>
              <Button onClick={() => toast.success("Profile saved")}>Save profile</Button>
            </Section>
          </TabsContent>

          <TabsContent value="signature" className="space-y-4">
            <Section title="Signature" description="Appended to new messages and replies.">
              <Textarea
                rows={6}
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                className="font-mono text-sm"
              />
              <div className="flex items-center gap-3">
                <Switch checked={autoSign} onCheckedChange={setAutoSign} id="autosign" />
                <Label htmlFor="autosign" className="cursor-pointer">Auto-append signature</Label>
              </div>
              <Button onClick={() => toast.success("Signature saved")}>Save signature</Button>
            </Section>
          </TabsContent>

          <TabsContent value="appearance" className="space-y-4">
            <Section title="Appearance" description="Change how Nyota Inbox looks on this device.">
              <div className="grid grid-cols-2 gap-3">
                {(["light", "dark"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={`rounded-xl border-2 p-4 text-left transition ${
                      theme === t ? "border-primary" : "border-border hover:border-muted-foreground/40"
                    }`}
                  >
                    <div
                      className={`mb-3 h-14 rounded-md ${
                        t === "dark" ? "bg-slate-900" : "bg-slate-100"
                      }`}
                    />
                    <div className="text-sm font-medium capitalize">{t}</div>
                  </button>
                ))}
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="security" className="space-y-4">
            <Section title="Security" description="Protect your account and mailbox.">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Two-factor authentication</Label>
                  <p className="text-xs text-muted-foreground">Require a code from your phone when signing in.</p>
                </div>
                <Switch checked={twoFactor} onCheckedChange={(v) => { setTwoFactor(v); toast(v ? "2FA enrollment coming next" : "2FA disabled"); }} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Active sessions</Label>
                  <p className="text-xs text-muted-foreground">1 device signed in (this browser).</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => toast("Session revoked")}>Sign out others</Button>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Mailbox password</Label>
                  <p className="text-xs text-muted-foreground">Managed on your Plesk mail server.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => toast("Redirect to Plesk password change — pending Cloud")}>Change</Button>
              </div>
            </Section>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
