import { createFileRoute, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { mailClient } from "@/lib/api/client";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSession, getSessionStatus } from "@/lib/mock-auth";
import {
  MAIL_SERVERS,
  ONBOARDING_STEPS,
  PLAN_LIMITS,
  brandPreview,
  clearDraft,
  dnsRecordsFor,
  emptyDraft,
  loadDraft,
  saveDraft,
  saveProvisionedTenant,
  slugify,
  stepErrors,
  type OnboardingDraft,
} from "@/lib/onboarding";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Copy, Loader2, Mail, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({
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
      { title: "Tenant Onboarding — Nyota Inbox" },
      { name: "description", content: "Guided setup for a new Nyota Inbox tenant: branding, domain binding and mailbox provisioning." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<OnboardingDraft>(() => loadDraft() ?? emptyDraft());
  const [provisioning, setProvisioning] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    saveDraft(draft);
  }, [draft]);

  const patch = (p: Partial<OnboardingDraft>) => setDraft((d) => ({ ...d, ...p }));
  const step = draft.step;
  const errors = useMemo(() => stepErrors(draft, step), [draft, step]);
  const current = ONBOARDING_STEPS.find((s) => s.id === step) ?? ONBOARDING_STEPS[0];

  function goNext() {
    if (errors.length > 0) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    if (step < ONBOARDING_STEPS.length) patch({ step: step + 1 });
  }

async function finish() {
  setProvisioning(true);

  try {
const tenant = await mailClient.createTenant({
  slug: draft.slug,
  name: draft.companyName,
  hostname: draft.hostname,
  allowedDomains: [draft.mailDomain],
  plan: draft.plan,
  mailServerId: draft.mailServerId,
  adminEmail: draft.mailboxes.find(
    (m) => m.role === "company_admin"
  )
    ? `${draft.mailboxes.find(
        (m) => m.role === "company_admin"
      )!.localPart}@${draft.mailDomain}`
    : undefined,
});

    toast.success(`${draft.companyName} created successfully`);

    localStorage.removeItem("nyota-onboarding-draft");

    window.location.href = `/super-admin/${tenant.id}`;

  } catch (e) {
    console.error("CREATE TENANT ERROR:", e);
toast.error((e as Error).message || "Failed to create tenant");
  } finally {
    setProvisioning(false);
  }
}

  return (
    <AppShell title="Tenant onboarding">
      <div className="mx-auto max-w-5xl p-6">
        <header className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">Onboard a new tenant</h1>
              <p className="text-sm text-muted-foreground">
                Branding, domain binding and initial mailboxes — your progress is saved automatically.
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/super-admin">Back to platform admin</Link>
            </Button>
          </div>
          <Progress value={((step - 1) / (ONBOARDING_STEPS.length - 1)) * 100} className="mt-5 h-1.5" />
        </header>

        <div className="grid gap-6 md:grid-cols-[220px_1fr]">
          <nav aria-label="Onboarding steps" className="space-y-1">
            {ONBOARDING_STEPS.map((s) => {
              const done = s.id < step;
              const active = s.id === step;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => s.id <= step && patch({ step: s.id })}
                  aria-current={active ? "step" : undefined}
                  className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                    active ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/40"
                  } ${s.id > step ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      done ? "bg-primary text-primary-foreground" : active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : s.id}
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{s.title}</span>
                    <span className="block text-xs text-muted-foreground">{s.blurb}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-base font-semibold">
              Step {step} of {ONBOARDING_STEPS.length} — {current.title}
            </h2>
            <p className="mb-5 text-sm text-muted-foreground">{current.blurb}</p>

            {step === 1 && <CompanyStep draft={draft} patch={patch} setDraft={setDraft} />}
            {step === 2 && <BrandingStep draft={draft} patch={patch} />}
            {step === 3 && <DomainStep draft={draft} patch={patch} />}
            {step === 4 && <MailboxStep draft={draft} patch={patch} />}
            {step === 5 && <ReviewStep draft={draft} />}

            {showErrors && errors.length > 0 && (
              <ul className="mt-5 space-y-1 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {errors.map((e) => (
                  <li key={e} className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {e}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-5">
              <Button
                variant="ghost"
                size="sm"
                disabled={step === 1 || provisioning}
                onClick={() => {
                  setShowErrors(false);
                  patch({ step: step - 1 });
                }}
              >
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={provisioning}
                  onClick={() => {
                    clearDraft();
                    setDraft(emptyDraft());
                    setShowErrors(false);
                    toast.info("Onboarding draft discarded");
                  }}
                >
                  Discard
                </Button>
                {step < ONBOARDING_STEPS.length ? (
                  <Button size="sm" onClick={goNext}>
                    Continue <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                ) : (
                  <Button size="sm" onClick={finish} disabled={provisioning}>
                    {provisioning ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1 h-4 w-4" />}
                    {provisioning ? "Provisioning…" : "Provision tenant"}
                  </Button>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

type StepProps = {
  draft: OnboardingDraft;
  patch: (p: Partial<OnboardingDraft>) => void;
  setDraft: React.Dispatch<React.SetStateAction<OnboardingDraft>>;
};

function CompanyStep({ draft, patch, setDraft }: StepProps) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="companyName">Company name</Label>
          <Input
            id="companyName"
            value={draft.companyName}
            placeholder="Acme Corp"
            onChange={(e) => {
              const companyName = e.target.value;
              setDraft((d) => ({
                ...d,
                companyName,
                slug: slugify(companyName),
                welcomeMessage: d.welcomeEdited ? d.welcomeMessage : companyName ? `Sign in to ${companyName} Mail.` : "",
              }));
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slug">Tenant slug</Label>
          <Input id="slug" value={draft.slug} onChange={(e) => patch({ slug: slugify(e.target.value) })} className="font-mono" placeholder="acme" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="mailDomain">Mail domain</Label>
          <Input
            id="mailDomain"
            value={draft.mailDomain}
            placeholder="acme.com"
            className="font-mono"
            onChange={(e) => {
              const mailDomain = e.target.value.trim().toLowerCase();
              patch({
                mailDomain,
                hostname: draft.hostnameEdited ? draft.hostname : mailDomain ? `inbox.${mailDomain}` : "",
                domainVerified: false,
              });
            }}
          />
          <p className="text-xs text-muted-foreground">Existing Plesk domain that hosts the mailboxes.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="supportEmail">Support email (optional)</Label>
          <Input id="supportEmail" value={draft.supportEmail} placeholder="it@acme.com" onChange={(e) => patch({ supportEmail: e.target.value })} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Plan</Label>
          <Select
            value={draft.plan}
            onValueChange={(v) => {
              const plan = v as OnboardingDraft["plan"];
              patch({ plan, licensedMailboxes: Math.min(draft.licensedMailboxes || PLAN_LIMITS[plan], PLAN_LIMITS[plan]) });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a plan">
                {draft.plan.charAt(0).toUpperCase() + draft.plan.slice(1)} — up to {PLAN_LIMITS[draft.plan]} mailboxes
              </SelectValue>
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="starter">Starter — up to {PLAN_LIMITS.starter} mailboxes</SelectItem>
              <SelectItem value="business">Business — up to {PLAN_LIMITS.business} mailboxes</SelectItem>
              <SelectItem value="enterprise">Enterprise — up to {PLAN_LIMITS.enterprise} mailboxes</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="licensed">Licensed mailboxes</Label>
          <Input
            id="licensed"
            type="number"
            min={1}
            max={PLAN_LIMITS[draft.plan]}
            value={draft.licensedMailboxes}
            onChange={(e) => patch({ licensedMailboxes: Number(e.target.value) })}
          />
        </div>
      </div>
    </div>
  );
}

function BrandingStep({ draft, patch }: Omit<StepProps, "setDraft">) {
  const brand = brandPreview(draft);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="logoUrl">Logo URL (optional)</Label>
          <Input id="logoUrl" value={draft.logoUrl} placeholder="https://acme.com/logo.svg" onChange={(e) => patch({ logoUrl: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="welcome">Sign-in welcome message</Label>
          <Textarea id="welcome" rows={3} value={draft.welcomeMessage} onChange={(e) => patch({ welcomeMessage: e.target.value, welcomeEdited: true })} />
        </div>
        <div className="space-y-3">
          <Label>Primary colour</Label>
          <Slider value={[draft.primaryHue]} min={0} max={359} step={1} onValueChange={([v]) => patch({ primaryHue: v })} />
          <Label>Accent colour</Label>
          <Slider value={[draft.accentHue]} min={0} max={359} step={1} onValueChange={([v]) => patch({ accentHue: v })} />
        </div>
      </div>

      <div className="rounded-2xl border border-border p-5" style={{ background: `color-mix(in oklab, ${brand.primary} 6%, transparent)` }}>
        <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live preview</div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold" style={{ background: brand.primary, color: "white" }}>
              {(draft.companyName || "N").charAt(0).toUpperCase()}
            </span>
            <span className="text-sm font-semibold">{draft.companyName || "Your company"} Mail</span>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">{draft.welcomeMessage || "Sign in to continue."}</p>
          <div className="mt-4 h-9 rounded-lg border border-border bg-muted/40" />
          <button type="button" className="mt-3 w-full rounded-lg py-2 text-sm font-medium text-white" style={{ background: brand.primary }}>
            Sign in
          </button>
          <div className="mt-3 h-1.5 w-16 rounded-full" style={{ background: brand.accent }} />
        </div>
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          primary {brand.primary}
          <br />
          accent {brand.accent}
        </p>
      </div>
    </div>
  );
}

function DomainStep({ draft, patch }: Omit<StepProps, "setDraft">) {
  const [verifying, setVerifying] = useState(false);
  const records = dnsRecordsFor(draft);

  async function verify() {
    setVerifying(true);
    await new Promise((r) => setTimeout(r, 1100));
    setVerifying(false);
    patch({ domainVerified: true });
    toast.success("DNS records verified — TLS certificate queued");
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="hostname">Webmail hostname</Label>
        <Input
          id="hostname"
          value={draft.hostname}
          placeholder="inbox.acme.com"
          className="font-mono"
          onChange={(e) => patch({ hostname: e.target.value.trim().toLowerCase(), hostnameEdited: true, domainVerified: false })}
        />
        <p className="text-xs text-muted-foreground">Tenants are resolved by hostname — this is the URL your customer signs in on.</p>
      </div>

      <div className="rounded-xl border border-border">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-medium">DNS records</span>
          {draft.domainVerified ? (
            <Badge className="gap-1"><Check className="h-3 w-3" /> Verified</Badge>
          ) : (
            <Badge variant="secondary">Pending</Badge>
          )}
        </div>
        <ul className="divide-y divide-border">
          {records.map((r) => (
            <li key={r.name + r.type} className="flex flex-wrap items-center gap-3 px-4 py-3 text-xs">
              <Badge variant="outline" className="font-mono">{r.type}</Badge>
              <span className="font-mono">{r.name}</span>
              <span className="text-muted-foreground">→</span>
              <span className="font-mono">{r.value}</span>
              <span className="ml-auto flex items-center gap-2">
                <span className="hidden text-muted-foreground sm:inline">{r.note}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Copy ${r.type} record`}
                  onClick={() => {
                    void navigator.clipboard.writeText(`${r.type} ${r.name} ${r.value}`);
                    toast.success("Record copied");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <Button size="sm" variant={draft.domainVerified ? "outline" : "default"} onClick={verify} disabled={verifying}>
        {verifying ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1 h-4 w-4" />}
        {verifying ? "Checking DNS…" : draft.domainVerified ? "Re-check DNS" : "Verify DNS"}
      </Button>

      <div className="space-y-3">
        <Label>Mail server</Label>
        {MAIL_SERVERS.map((s) => (
          <label
            key={s.id}
            className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 hover:bg-muted/40 ${
              draft.mailServerId === s.id ? "border-primary/40 bg-primary/5" : "border-border"
            }`}
          >
            <span>
              <span className="block text-sm font-medium">{s.id}</span>
              <span className="block text-xs text-muted-foreground">{s.hostname} · {s.region}</span>
            </span>
            <span className="flex items-center gap-3">
              <Badge variant={s.status === "healthy" ? "default" : "destructive"}>{s.status}</Badge>
              <input
                type="radio"
                name="mailServer"
                checked={draft.mailServerId === s.id}
                onChange={() => patch({ mailServerId: s.id })}
              />
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function MailboxStep({ draft, patch }: Omit<StepProps, "setDraft">) {
  const [localPart, setLocalPart] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"company_admin" | "user">(
    draft.mailboxes.some((m) => m.role === "company_admin") ? "user" : "company_admin",
  );
  const domain = draft.mailDomain || "your-company.com";
  const remaining = draft.licensedMailboxes - draft.mailboxes.length;

  function add() {
    const lp = localPart.trim().toLowerCase();
    if (!lp) return;
    if (draft.mailboxes.some((m) => m.localPart.toLowerCase() === lp)) {
      toast.error("That mailbox already exists");
      return;
    }
    if (remaining <= 0) {
      toast.error("No licensed mailboxes left on this plan");
      return;
    }
    patch({ mailboxes: [...draft.mailboxes, { localPart: lp, displayName: displayName.trim() || lp, role, quotaMb: 2048 }] });
    setLocalPart("");
    setDisplayName("");
    setRole("user");
  }

  return (
    <div className="space-y-5">
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
        <div className="space-y-2">
          <Label htmlFor="localPart">Mailbox</Label>
          <div className="flex items-center gap-1">
            <Input id="localPart" value={localPart} placeholder="admin" className="font-mono" onChange={(e) => setLocalPart(e.target.value)} />
            <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">@{domain}</span>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="displayName">Display name</Label>
          <Input id="displayName" value={displayName} placeholder="Amara Okafor" onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as "company_admin" | "user")}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="company_admin">Company admin</SelectItem>
              <SelectItem value="user">User</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={add}><Plus className="mr-1 h-4 w-4" /> Add</Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {draft.mailboxes.length} of {draft.licensedMailboxes} licensed mailboxes used. Mailboxes are created on the tenant's Plesk domain — Nyota never stores passwords, so each user sets one via an activation email.
      </p>

      {draft.mailboxes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <Mail className="mx-auto mb-2 h-5 w-5" />
          No mailboxes yet — start with the company admin.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Address</TableHead>
              <TableHead>Display name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Quota</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {draft.mailboxes.map((m, i) => (
              <TableRow key={m.localPart}>
                <TableCell className="font-mono text-xs">{m.localPart}@{domain}</TableCell>
                <TableCell>{m.displayName}</TableCell>
                <TableCell>
                  <Badge variant={m.role === "company_admin" ? "default" : "outline"}>
                    {m.role === "company_admin" ? "Company admin" : "User"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{Math.round(m.quotaMb / 1024)} GB</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${m.localPart}`}
                    onClick={() => patch({ mailboxes: draft.mailboxes.filter((_, idx) => idx !== i) })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function ReviewStep({ draft }: { draft: OnboardingDraft }) {
  const brand = brandPreview(draft);
  const rows: Array<[string, string]> = [
    ["Company", draft.companyName],
    ["Tenant slug", draft.slug],
    ["Plan", `${draft.plan} · ${draft.licensedMailboxes} licensed mailboxes`],
    ["Mail domain", draft.mailDomain],
    ["Webmail hostname", draft.hostname],
    ["Domain status", draft.domainVerified ? "Verified" : "Not verified"],
    ["Mail server", draft.mailServerId],
    ["Branding", `${brand.primary} / ${brand.accent}`],
    ["Support email", draft.supportEmail || "—"],
  ];
  return (
    <div className="space-y-5">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="rounded-xl border border-border p-3">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="mt-0.5 break-words text-sm font-medium">{v || "—"}</dd>
          </div>
        ))}
      </dl>
      <div className="rounded-xl border border-border p-4">
        <div className="mb-2 text-sm font-medium">Mailboxes to provision ({draft.mailboxes.length})</div>
        <ul className="space-y-1 font-mono text-xs">
          {draft.mailboxes.map((m) => (
            <li key={m.localPart} className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-primary" />
              {m.localPart}@{draft.mailDomain} · {m.role}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">
        On provision: the tenant record and branding are written, the hostname is bound with a TLS certificate, and each mailbox is created on {draft.mailServerId} with an activation email.
      </p>
    </div>
  );
}
