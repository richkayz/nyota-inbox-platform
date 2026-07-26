import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { NYOTA_ONE, resolveTenantByHost, type TenantBranding } from "@/lib/tenants";

interface BrandContextValue {
  tenant: TenantBranding;
}

const BrandContext = createContext<BrandContextValue>({ tenant: NYOTA_ONE });

export function BrandProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<TenantBranding>(NYOTA_ONE);

  useEffect(() => {
    setTenant(resolveTenantByHost(window.location.hostname));
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
