import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { NYOTA_ONE, resolveInitialTenant, type TenantBranding } from "@/lib/tenants";

interface BrandContextValue {
  tenant: TenantBranding;
}

const BrandContext = createContext<BrandContextValue>({ tenant: NYOTA_ONE });

export function BrandProvider({ children }: { children: ReactNode }) {
  // Lazy init so the first render already uses the correct tenant palette
  // — no flash of the Nyota default while an effect runs post-mount.
  const [tenant, setTenant] = useState<TenantBranding>(() => resolveInitialTenant());

  useEffect(() => {
    // Re-resolve on mount in case SSR fell back to the default.
    const resolved = resolveInitialTenant();
    if (resolved.id !== tenant.id) setTenant(resolved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--primary", tenant.primary);
    root.style.setProperty("--ring", tenant.primary);
    root.style.setProperty("--sidebar-primary", tenant.primary);
    root.style.setProperty("--sidebar-ring", tenant.primary);
    root.style.setProperty("--accent", tenant.accent);
    document.title = `${tenant.name} — Inbox`;
  }, [tenant]);

  const value = useMemo(() => ({ tenant }), [tenant]);
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useTenant() {
  return useContext(BrandContext).tenant;
}
