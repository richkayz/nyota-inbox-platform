import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionStatus } from "@/lib/mock-auth";
import { mailClient, isLiveMode } from "@/lib/api/client";
import type { Diagnostics, HealthCheck } from "@/lib/api/types";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Download,
  Send,
  Mail,
  Database,
  Server,
  ShieldCheck,
  Radio,
  Lock,
  ArrowLeft,
} from "lucide-react";

export const Route = createFileRoute("/settings/diagnostics")({
  beforeLoad: ({ location }) => {
    if (typeof window === "undefined") return;
    const status = getSessionStatus();
    if (status !== "active") {
      throw redirect({
        to: "/login",
        search: {
          redirect: location.href,
          ...(status === "expired" ? { reason: "expired" as const } : {}),
        },
      });
    }
  },
  head: () => ({
    meta: [
      { title: "Connection Diagnostics — Nyota Inbox" },
      {
        name: "description",
        content:
          "Verify the Nyota Inbox gateway, IMAP, SMTP, database and authentication status against your Plesk mail server.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DiagnosticsPage,
});

const GATEWAY_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";

function DiagnosticsPage() {
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const query = useQuery({
    queryKey: ["diagnostics"],
    queryFn: async () => {
      const start = performance.now();
      const data = await mailClient.diagnostics();
      const rtt = Math.round(performance.now() - start);
      setLastRefreshed(new Date());
      return { data, rtt };
    },
    refetchOnWindowFocus: false,
  });

  const testImap = useMutation({
    mutationFn: () => mailClient.testImap(),
    onSuccess: (r) =>
      r.ok
        ? toast.success(`IMAP login OK (${r.latencyMs} ms)`)
        : toast.error(`IMAP login failed — ${r.detail ?? "unknown"}`),
    onError: (err: Error) => toast.error(err.message),
  });

  const testSmtp = useMutation({
    mutationFn: () => mailClient.testSmtp(),
    onSuccess: (r) =>
      r.ok
        ? toast.success(`SMTP verify OK (${r.latencyMs} ms)`)
        : toast.error(`SMTP verify failed — ${r.detail ?? "unknown"}`),
    onError: (err: Error) => toast.error(err.message),
  });

  const diagnostics = query.data?.data;
  const rtt = query.data?.rtt ?? 0;

  const report = useMemo(() => {
    if (!diagnostics) return null;
    return {
      generatedAt: new Date().toISOString(),
      apiLatencyMs: rtt,
      gatewayUrl: GATEWAY_URL,
      ...diagnostics,
    };
  }, [diagnostics, rtt]);

  function download() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nyota-diagnostics-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell title="Diagnostics">
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <Link
              to="/settings"
              className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Back to settings
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">
              Connection diagnostics
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Live end-to-end checks against your Plesk / Postfix / Dovecot
              infrastructure.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={download}
              disabled={!report}
            >
              <Download className="mr-2 h-4 w-4" /> Download report
            </Button>
          </div>
        </div>

        <ModeBanner mode={isLiveMode ? "live" : "mock"} />

        <Card>
          <CardHeader
            title="Gateway"
            icon={<Server className="h-4 w-4" />}
            action={
              query.isFetching ? (
                <Badge variant="secondary">Refreshing…</Badge>
              ) : diagnostics ? (
                <StatusPill ok={diagnostics.gateway.status === "ok"} />
              ) : (
                <StatusPill ok={false} label="Unreachable" />
              )
            }
          />
          {query.isLoading ? (
            <SkeletonRows n={5} />
          ) : query.isError ? (
            <p className="text-sm text-destructive">
              Gateway unreachable at{" "}
              <code className="rounded bg-muted px-1">{GATEWAY_URL}</code> —{" "}
              {(query.error as Error).message}
            </p>
          ) : diagnostics ? (
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <Row k="Gateway URL" v={GATEWAY_URL} />
              <Row k="Version" v={diagnostics.gateway.version} />
              <Row k="Environment" v={diagnostics.gateway.environment} />
              <Row
                k="API latency"
                v={`${rtt} ms`}
                hint={rtt > 500 ? "high" : "healthy"}
              />
              <Row
                k="Uptime"
                v={formatUptime(diagnostics.gateway.uptimeSeconds)}
              />
              <Row
                k="Last check"
                v={lastRefreshed.toLocaleTimeString()}
              />
            </dl>
          ) : null}
        </Card>

        <Card>
          <CardHeader
            title="Authentication"
            icon={<ShieldCheck className="h-4 w-4" />}
          />
          {diagnostics ? (
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <Row k="Signed-in mailbox" v={diagnostics.session.email} />
              <Row k="Tenant" v={diagnostics.session.tenantId} />
              <Row k="Role" v={diagnostics.session.role} />
              <Row
                k="JWT access token"
                v={diagnostics.session.jwtValid ? "Valid" : "Invalid"}
                ok={diagnostics.session.jwtValid}
              />
              <Row
                k="Refresh token"
                v={
                  diagnostics.session.refreshTokenPresent
                    ? "Present"
                    : "Missing"
                }
                ok={diagnostics.session.refreshTokenPresent}
              />
              <Row
                k="Session ID"
                v={diagnostics.session.sessionId.slice(0, 8) + "…"}
              />
            </dl>
          ) : (
            <SkeletonRows n={4} />
          )}
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CheckCard
            title="IMAP (Dovecot)"
            icon={<Mail className="h-4 w-4" />}
            check={diagnostics?.checks.imapReachable}
            loading={query.isLoading}
          />
          <CheckCard
            title="SMTP (Postfix)"
            icon={<Send className="h-4 w-4" />}
            check={diagnostics?.checks.smtpReachable}
            loading={query.isLoading}
          />
          <CheckCard
            title="Database (MariaDB)"
            icon={<Database className="h-4 w-4" />}
            check={diagnostics?.checks.database}
            loading={query.isLoading}
          />
          <CheckCard
            title="Mailbox authentication"
            icon={<Lock className="h-4 w-4" />}
            check={diagnostics?.checks.imapAuth}
            loading={query.isLoading}
          />
        </div>

        {diagnostics?.checks.imapAuth?.meta && (
          <Card>
            <CardHeader
              title="IMAP capabilities & folders"
              icon={<Radio className="h-4 w-4" />}
              action={
                <Badge
                  variant={
                    diagnostics.checks.imapAuth.meta.supportsIdle
                      ? "default"
                      : "secondary"
                  }
                >
                  IDLE{" "}
                  {diagnostics.checks.imapAuth.meta.supportsIdle
                    ? "supported"
                    : "unavailable"}
                </Badge>
              }
            />
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <Row
                k="TLS"
                v={diagnostics.checks.imapAuth.meta.tls ? "Encrypted" : "Plain"}
                ok={diagnostics.checks.imapAuth.meta.tls}
              />
              <Row
                k="Folders visible"
                v={String(diagnostics.checks.imapAuth.meta.folderCount ?? 0)}
              />
            </dl>
            <Separator className="my-4" />
            <div className="space-y-3">
              <TokenList
                label="Capabilities"
                items={diagnostics.checks.imapAuth.meta.capabilities ?? []}
              />
              <TokenList
                label="Folders"
                items={diagnostics.checks.imapAuth.meta.folders ?? []}
              />
            </div>
          </Card>
        )}

        <Card>
          <CardHeader title="Test actions" icon={<RefreshCw className="h-4 w-4" />} />
          <p className="mb-4 text-xs text-muted-foreground">
            {isLiveMode
              ? "Each button runs a real check against your mail server. No simulated responses."
              : "You are in mock mode — these buttons will report the mock adapter is not connected to a real server."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => testImap.mutate()}
              disabled={testImap.isPending}
            >
              <Mail className="mr-2 h-4 w-4" />
              {testImap.isPending ? "Testing IMAP…" : "Test IMAP login"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => testSmtp.mutate()}
              disabled={testSmtp.isPending}
            >
              <Send className="mr-2 h-4 w-4" />
              {testSmtp.isPending ? "Testing SMTP…" : "Test SMTP send"}
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function ModeBanner({ mode }: { mode: "mock" | "live" }) {
  if (mode === "live") {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
        <div className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> Live mode — connected to a real
          mail server
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          All checks below execute against{" "}
          <code className="rounded bg-muted px-1">{GATEWAY_URL}</code> and
          the Plesk / Postfix / Dovecot services it fronts.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
      <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
        <XCircle className="h-4 w-4" /> Mock mode — not connected to a real
        mail server
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        The UI is running against the in-memory mock adapter. Set{" "}
        <code className="rounded bg-muted px-1">VITE_API_MODE=live</code> and{" "}
        <code className="rounded bg-muted px-1">VITE_API_BASE_URL</code> to
        point at the deployed gateway to run real diagnostics.
      </p>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      {children}
    </section>
  );
}

function CardHeader({
  title,
  icon,
  action,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </h2>
      {action}
    </div>
  );
}

function Row({
  k,
  v,
  ok,
  hint,
}: {
  k: string;
  v: string;
  ok?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/50 py-1.5 last:border-none">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {k}
      </dt>
      <dd className="flex items-center gap-2 text-right text-sm font-medium">
        {typeof ok === "boolean" &&
          (ok ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <XCircle className="h-3.5 w-3.5 text-destructive" />
          ))}
        <span className="break-all">{v}</span>
        {hint && (
          <Badge variant="secondary" className="ml-1 text-[10px]">
            {hint}
          </Badge>
        )}
      </dd>
    </div>
  );
}

function CheckCard({
  title,
  icon,
  check,
  loading,
}: {
  title: string;
  icon: React.ReactNode;
  check?: HealthCheck;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader
        title={title}
        icon={icon}
        action={
          loading ? (
            <Badge variant="secondary">Checking…</Badge>
          ) : check ? (
            <StatusPill ok={check.ok} />
          ) : (
            <StatusPill ok={false} label="Unknown" />
          )
        }
      />
      {loading ? (
        <SkeletonRows n={2} />
      ) : check ? (
        <div className="space-y-1 text-sm">
          <Row k="Latency" v={`${check.latencyMs} ms`} />
          {check.detail && (
            <p className="mt-1 text-xs text-muted-foreground">{check.detail}</p>
          )}
          {check.meta && Object.keys(check.meta).length > 0 && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                Details
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-[11px]">
                {JSON.stringify(check.meta, null, 2)}
              </pre>
            </details>
          )}
        </div>
      ) : null}
    </Card>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label?: string }) {
  return (
    <Badge
      className={
        ok
          ? "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
          : "bg-destructive/15 text-destructive hover:bg-destructive/20"
      }
      variant="secondary"
    >
      {ok ? (
        <CheckCircle2 className="mr-1 h-3 w-3" />
      ) : (
        <XCircle className="mr-1 h-3 w-3" />
      )}
      {label ?? (ok ? "Healthy" : "Failing")}
    </Badge>
  );
}

function TokenList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-wrap gap-1">
        {items.map((s) => (
          <span
            key={s}
            className="rounded-md border border-border bg-muted/50 px-2 py-0.5 font-mono text-[11px]"
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

function SkeletonRows({ n }: { n: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: n }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

function formatUptime(s: number): string {
  if (!s || s < 0) return "—";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

export { DiagnosticsPage };
export type { Diagnostics };
