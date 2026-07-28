// Plugin/module registry — future modules register here.
// Real impl: loaded from DB per-tenant + entitlements from subscription tier.
import type { LucideIcon } from "lucide-react";
import { Inbox, Users, Calendar, CheckSquare, Sparkles, ShieldCheck, Settings, Building2, Globe2 } from "lucide-react";

export interface AppModule {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  enabled: boolean;
  comingSoon?: boolean;
  requiresRole?: "super_admin" | "company_admin";
}

export const CORE_MODULES: AppModule[] = [
  { id: "mail", label: "Mail", to: "/mail", icon: Inbox, enabled: true },
  { id: "contacts", label: "Contacts", to: "/mail", icon: Users, enabled: false, comingSoon: true },
  { id: "calendar", label: "Calendar", to: "/mail", icon: Calendar, enabled: false, comingSoon: true },
  { id: "tasks", label: "Tasks", to: "/mail", icon: CheckSquare, enabled: false, comingSoon: true },
  { id: "ai", label: "AI Assistant", to: "/mail", icon: Sparkles, enabled: false, comingSoon: true },
  { id: "guard", label: "Email Guard", to: "/mail", icon: ShieldCheck, enabled: false, comingSoon: true },
];

export const ADMIN_MODULES: AppModule[] = [
  { id: "settings", label: "Settings", to: "/settings", icon: Settings, enabled: true },
  { id: "admin", label: "Company Admin", to: "/admin", icon: Building2, enabled: true, requiresRole: "company_admin" },
  { id: "super", label: "Platform Admin", to: "/super-admin", icon: Globe2, enabled: true, requiresRole: "super_admin" },
];
