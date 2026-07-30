// Tenant onboarding draft state. Frontend-only for now: the draft is persisted
// in localStorage so a half-finished onboarding survives a reload, and the
// completed tenants are kept in the same store until the gateway exposes
// POST /tenants + Plesk mailbox provisioning.

export interface OnboardingMailbox {
  localPart: string;
  displayName: string;
  role: "company_admin" | "user";
  quotaMb: number;
}

export interface OnboardingDraft {
  step: number;
  // Company
  companyName: string;
  slug: string;
  mailDomain: string;
  supportEmail: string;
  plan: "starter" | "business" | "enterprise";
  licensedMailboxes: number;
  // Branding
  primaryHue: number;
  accentHue: number;
  logoUrl: string;
  welcomeMessage: string;
  // Domain binding
  hostname: string;
  domainVerified: boolean;
  /** True once the operator edits the hostname by hand, disabling auto-derivation. */
  hostnameEdited: boolean;
  /** True once the operator edits the welcome copy by hand. */
  welcomeEdited: boolean;
  mailServerId: string;
  // Mailboxes
  mailboxes: OnboardingMailbox[];
  completedAt?: string;
}

export const MAIL_SERVERS = [
  { id: "plesk-eu-1", hostname: "mail-eu-1.plesk.io", region: "EU-West", status: "healthy" },
  { id: "plesk-eu-2", hostname: "mail-eu-2.plesk.io", region: "EU-Central", status: "healthy" },
  { id: "plesk-us-1", hostname: "mail-us-1.plesk.io", region: "US-East", status: "degraded" },
] as const;

export const PLAN_LIMITS: Record<OnboardingDraft["plan"], number> = {
  starter: 10,
  business: 50,
  enterprise: 500,
};

export const ONBOARDING_STEPS = [
  { id: 1, key: "company", title: "Company", blurb: "Identity, plan and licensing" },
  { id: 2, key: "branding", title: "Branding", blurb: "Colours, logo and welcome copy" },
  { id: 3, key: "domain", title: "Domain", blurb: "Hostname binding and DNS" },
  { id: 4, key: "mailboxes", title: "Mailboxes", blurb: "Initial mailbox provisioning" },
  { id: 5, key: "review", title: "Review", blurb: "Confirm and provision" },
] as const;

const DRAFT_KEY = "nyota.onboarding.draft";
const TENANTS_KEY = "nyota.onboarding.tenants";

export function emptyDraft(): OnboardingDraft {
  return {
    step: 1,
    companyName: "",
    slug: "",
    mailDomain: "",
    supportEmail: "",
    plan: "business",
    licensedMailboxes: PLAN_LIMITS.business,
    primaryHue: 265,
    accentHue: 68,
    logoUrl: "",
    welcomeMessage: "",
    hostname: "",
    domainVerified: false,
    hostnameEdited: false,
    welcomeEdited: false,
    mailServerId: MAIL_SERVERS[0].id,
    mailboxes: [],
  };
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

export function loadDraft(): OnboardingDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return { ...emptyDraft(), ...(JSON.parse(raw) as OnboardingDraft) };
  } catch {
    return null;
  }
}

export function saveDraft(draft: OnboardingDraft) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function clearDraft() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DRAFT_KEY);
}

export function loadProvisionedTenants(): OnboardingDraft[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(TENANTS_KEY) ?? "[]") as OnboardingDraft[];
  } catch {
    return [];
  }
}

export function saveProvisionedTenant(draft: OnboardingDraft) {
  if (typeof window === "undefined") return;
  const all = loadProvisionedTenants();
  all.unshift({ ...draft, completedAt: new Date().toISOString() });
  window.localStorage.setItem(TENANTS_KEY, JSON.stringify(all.slice(0, 25)));
}

export interface DnsRecord {
  type: string;
  name: string;
  value: string;
  note: string;
}

export function dnsRecordsFor(draft: OnboardingDraft): DnsRecord[] {
  const host = draft.hostname || "inbox.your-company.com";
  const slug = draft.slug || "tenant";
  return [
    { type: "CNAME", name: host, value: "tenants.nyota.one", note: "Routes the webmail host to Nyota Inbox" },
    { type: "TXT", name: `_nyota-verify.${host}`, value: `nyota-tenant=${slug}`, note: "Proves domain ownership" },
    { type: "TXT", name: draft.mailDomain || "your-company.com", value: "v=spf1 include:spf.nyota.one ~all", note: "Authorises outbound relay" },
  ];
}

/** Per-step validation used to gate the Continue button. */
export function stepErrors(draft: OnboardingDraft, step: number): string[] {
  const errors: string[] = [];
  if (step === 1) {
    if (draft.companyName.trim().length < 2) errors.push("Company name is required.");
    if (!draft.slug) errors.push("Tenant slug is required.");
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(draft.mailDomain.trim())) errors.push("Enter a valid mail domain, e.g. acme.com.");
    if (draft.licensedMailboxes < 1) errors.push("Licence at least one mailbox.");
    if (draft.licensedMailboxes > PLAN_LIMITS[draft.plan])
      errors.push(`The ${draft.plan} plan allows up to ${PLAN_LIMITS[draft.plan]} mailboxes.`);
  }
  if (step === 2) {
    if (draft.welcomeMessage.trim().length < 4) errors.push("Add a short welcome message for the sign-in screen.");
  }
  if (step === 3) {
    if (!/^[a-z0-9-]+\.[a-z0-9.-]+\.[a-z]{2,}$/.test(draft.hostname.trim()))
      errors.push("Enter a full hostname, e.g. inbox.acme.com.");
    if (!draft.domainVerified) errors.push("Verify the DNS records before continuing.");
    if (!draft.mailServerId) errors.push("Choose a mail server.");
  }
  if (step === 4) {
    if (draft.mailboxes.length === 0) errors.push("Add at least one mailbox — usually the company admin.");
    if (!draft.mailboxes.some((m) => m.role === "company_admin")) errors.push("One mailbox must be the company admin.");
    if (draft.mailboxes.length > draft.licensedMailboxes)
      errors.push(`Only ${draft.licensedMailboxes} mailboxes are licensed on this plan.`);
    const seen = new Set<string>();
    for (const m of draft.mailboxes) {
      const lp = m.localPart.trim().toLowerCase();
      if (!/^[a-z0-9._-]+$/.test(lp)) errors.push(`"${m.localPart || "(empty)"}" is not a valid mailbox name.`);
      if (seen.has(lp)) errors.push(`Duplicate mailbox: ${lp}`);
      seen.add(lp);
    }
  }
  return errors;
}

export function brandPreview(draft: OnboardingDraft) {
  return {
    primary: `oklch(0.52 0.18 ${draft.primaryHue})`,
    accent: `oklch(0.78 0.14 ${draft.accentHue})`,
  };
}
