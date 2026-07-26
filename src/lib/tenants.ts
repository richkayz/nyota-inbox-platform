// Tenant branding — currently in-memory; will be replaced with a DB lookup
// once Lovable Cloud is enabled. Hostname resolves to a tenant.

export interface TenantBranding {
  id: string;
  name: string;
  hostname: string; // matched against window.location.hostname
  logoUrl?: string;
  faviconUrl?: string;
  loginBgUrl?: string;
  welcomeMessage: string;
  primary: string; // oklch(...) value
  accent: string;
  supportEmail?: string;
}

// Default = Nyota One. Any hostname that isn't explicitly mapped falls back here.
export const NYOTA_ONE: TenantBranding = {
  id: "nyota",
  name: "Nyota One",
  hostname: "inbox.nyota.one",
  welcomeMessage: "Welcome back to Nyota Inbox.",
  primary: "oklch(0.42 0.18 265)",
  accent: "oklch(0.78 0.15 68)",
  supportEmail: "support@nyota.one",
};

// Demo tenants — replace with DB lookup.
const TENANTS: TenantBranding[] = [
  NYOTA_ONE,
  {
    id: "acme",
    name: "Acme Corp",
    hostname: "inbox.acme.com",
    welcomeMessage: "Sign in to Acme Mail.",
    primary: "oklch(0.55 0.2 25)",
    accent: "oklch(0.75 0.15 200)",
    supportEmail: "it@acme.com",
  },
  {
    id: "orbit",
    name: "Orbit Labs",
    hostname: "inbox.orbit.io",
    welcomeMessage: "Welcome to Orbit Mail.",
    primary: "oklch(0.5 0.19 155)",
    accent: "oklch(0.78 0.14 90)",
    supportEmail: "help@orbit.io",
  },
];

export function resolveTenantByHost(host: string | undefined | null): TenantBranding {
  if (!host) return NYOTA_ONE;
  const normalized = host.toLowerCase().split(":")[0];
  return TENANTS.find((t) => t.hostname === normalized) ?? NYOTA_ONE;
}
