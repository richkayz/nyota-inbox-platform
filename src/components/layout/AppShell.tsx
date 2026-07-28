import type { ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, Moon, Sun, Inbox as InboxIcon } from "lucide-react";
import { useTenant } from "@/components/branding/BrandProvider";
import { useTheme } from "@/components/theme/ThemeProvider";
import { clearSession, getSession } from "@/lib/mock-auth";
import { CORE_MODULES, ADMIN_MODULES } from "@/lib/mock-modules";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NotificationDrawer } from "@/components/mail/NotificationDrawer";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function AppShell({ children, title }: { children: ReactNode; title: string }) {
  const tenant = useTenant();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const session = getSession();

  const initials = (session?.displayName ?? "You")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const modules = [
    ...CORE_MODULES.filter((m) => m.enabled),
    ...ADMIN_MODULES.filter((m) => {
      if (!m.requiresRole) return true;
      if (session?.role === "super_admin") return true;
      return session?.role === m.requiresRole;
    }),
  ];

  function handleLogout() {
    clearSession();
    toast.success("Signed out");
    navigate({ to: "/login" });
  }

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside className="hidden w-16 shrink-0 flex-col items-center gap-1 border-r border-sidebar-border bg-sidebar py-4 md:flex">
        <div
          className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl text-primary-foreground"
          style={{ background: "var(--primary)" }}
          title={tenant.name}
        >
          <InboxIcon className="h-4 w-4" />
        </div>
        {modules.map((m) => {
          const Icon = m.icon;
          const active = pathname === m.to || (m.to !== "/mail" && pathname.startsWith(m.to));
          return (
            <Link
              key={m.id}
              to={m.to}
              title={m.label}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl transition",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent",
              )}
            >
              <Icon className="h-4 w-4" />
            </Link>
          );
        })}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4">
          <div>
            <h1 className="text-sm font-semibold tracking-tight">{title}</h1>
            <p className="text-xs text-muted-foreground">{tenant.name}</p>
          </div>
          <div className="flex items-center gap-1">
            <NotificationDrawer />
            <button
              onClick={toggle}
              aria-label="Toggle theme"
              className="rounded-md p-2 text-muted-foreground hover:bg-muted"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Avatar className="ml-1 h-8 w-8">
              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <button
              onClick={handleLogout}
              className="rounded-md p-2 text-muted-foreground hover:bg-muted"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
