import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mail, Lock, ArrowRight, Loader2, Moon, Sun } from "lucide-react";
import { useTenant } from "@/components/branding/BrandProvider";
import { useTheme } from "@/components/theme/ThemeProvider";
import { consumeExpiredFlag, setSession } from "@/lib/mock-auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    reason: search.reason === "expired" ? ("expired" as const) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — Nyota Inbox" },
      { name: "description", content: "Sign in to your company inbox." },
      { property: "og:title", content: "Sign in — Nyota Inbox" },
      { property: "og:description", content: "Sign in to your company inbox." },
    ],
  }),
  component: LoginPage,
});

function isSafeRedirect(path: string | undefined): path is string {
  return !!path && path.startsWith("/") && !path.startsWith("//");
}

function LoginPage() {
  const tenant = useTenant();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const router = useRouter();
  const search = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    // Mock: any credentials work. Real impl calls Mail Gateway IMAP LOGIN.
    await new Promise((r) => setTimeout(r, 600));
    setSession(
      {
        email,
        displayName: email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        role: email.startsWith("admin") ? "company_admin" : "user",
        tenantId: tenant.id,
      },
      { remember },
    );
    toast.success(`Welcome back to ${tenant.name}`);
    if (isSafeRedirect(search.redirect)) {
      // Preserve pathname + query string + hash by pushing the raw href.
      router.history.push(search.redirect);
    } else {
      navigate({ to: "/mail" });
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-4 py-10">
      {/* Ambient brand glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div
          className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--primary) 0%, transparent 60%)" }}
        />
        <div
          className="absolute bottom-0 right-0 h-[400px] w-[400px] translate-x-1/3 translate-y-1/3 rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 60%)" }}
        />
      </div>

      <button
        onClick={toggle}
        aria-label="Toggle theme"
        className="absolute right-4 top-4 rounded-full border border-border bg-card p-2 text-muted-foreground transition hover:text-foreground"
      >
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div
            className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-primary-foreground shadow-elevated"
            style={{ background: "var(--primary)" }}
          >
            <Mail className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{tenant.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{tenant.welcomeMessage}</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-elevated sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  className="text-xs text-muted-foreground transition hover:text-primary"
                  onClick={() => toast("Password reset — coming soon")}
                >
                  Forgot?
                </button>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none">
              <Checkbox
                checked={remember}
                onCheckedChange={(v) => setRemember(v === true)}
                id="remember"
              />
              <span>Remember me for 30 days</span>
            </label>

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Sign in <ArrowRight className="ml-1 h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Authenticated against your{" "}
            <span className="font-medium text-foreground">Plesk mail server</span>. No emails are stored on
            Nyota Inbox.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Need help? Contact{" "}
          {tenant.supportEmail ? (
            <a href={`mailto:${tenant.supportEmail}`} className="text-primary hover:underline">
              {tenant.supportEmail}
            </a>
          ) : (
            "your administrator"
          )}
          .
        </p>
      </div>
    </main>
  );
}
