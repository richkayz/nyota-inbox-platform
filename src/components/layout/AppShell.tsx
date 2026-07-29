import type { ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, Moon, Sun, Inbox as InboxIcon, User, Settings, ChevronDown } from "lucide-react";
import { useTenant } from "@/components/branding/BrandProvider";
import { useTheme } from "@/components/theme/ThemeProvider";
import { clearSession, getSession } from "@/lib/mock-auth";
import { CORE_MODULES, ADMIN_MODULES } from "@/lib/mock-modules";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NotificationDrawer } from "@/components/mail/NotificationDrawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="ml-1 flex items-center gap-2 rounded-md p-1 pr-2 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Open user menu"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <ChevronDown className="hidden h-3.5 w-3.5 sm:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">{session?.displayName}</span>
                    <span className="text-xs text-muted-foreground">{session?.email}</span>
                    <span className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {session?.role?.replace("_", " ")}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings" className="cursor-pointer">
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/admin" className="cursor-pointer">
                    <User className="h-4 w-4" />
                    Company admin
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
