import { createFileRoute, useNavigate, Link, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Inbox,
  Star,
  Send,
  FileEdit,
  ShieldAlert,
  Trash2,
  Search,
  Plus,
  Moon,
  Sun,
  LogOut,
  Reply,
  ReplyAll,
  Forward,
  Paperclip,
  Menu,
  X,
  Sparkles,
  Settings,
  Building2,
  Globe2,
  ChevronDown,
  User,
  Archive,
  MoreHorizontal,
  Rows3,
  Rows2,
  ArrowUpDown,
  Printer,
  Download,
  ArrowLeft,
} from "lucide-react";
import { useTenant } from "@/components/branding/BrandProvider";
import { useTheme } from "@/components/theme/ThemeProvider";
import { clearSession, getSession, getSessionStatus } from "@/lib/mock-auth";
import { recordAuditEvent } from "@/lib/audit-log";
import { FOLDERS, MESSAGES, formatMailDate, type MailMessage } from "@/lib/mock-mail";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { Composer } from "@/components/mail/Composer";
import { NotificationDrawer } from "@/components/mail/NotificationDrawer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";


export const Route = createFileRoute("/mail")({
  beforeLoad: ({ location }) => {
    if (typeof window === "undefined") return;
    const status = getSessionStatus();
    if (status !== "active") {
      throw redirect({
        to: "/login",
        search: { redirect: location.href, ...(status === "expired" ? { reason: "expired" as const } : {}) },
      });
    }
  },
  head: () => ({
    meta: [
      { title: "Inbox — Nyota Inbox" },
      { name: "description", content: "Read and send email in Nyota Inbox." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MailShell,
});

const FOLDER_ICONS: Record<string, typeof Inbox> = {
  inbox: Inbox,
  starred: Star,
  sent: Send,
  drafts: FileEdit,
  spam: ShieldAlert,
  trash: Trash2,
};

const PRIMARY_FOLDER_IDS = ["inbox", "starred", "sent", "drafts"];

// A palette that avatars fall back to; kept in oklch for consistency with tokens.
const AVATAR_TONES = [
  "oklch(0.92 0.08 265)",
  "oklch(0.92 0.08 30)",
  "oklch(0.92 0.08 150)",
  "oklch(0.92 0.08 300)",
  "oklch(0.92 0.08 210)",
  "oklch(0.92 0.08 90)",
];

function toneFor(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

function MailShell() {
  const tenant = useTenant();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [session, setSess] = useState(() => getSession());
  const [activeFolder, setActiveFolder] = useState("inbox");
  const [activeMessageId, setActiveMessageId] = useState<string | null>(MESSAGES[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [replyDefaults, setReplyDefaults] = useState<{ to: string; subject: string } | null>(null);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [starred, setStarred] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(MESSAGES.filter((m) => m.starred).map((m) => [m.id, true])),
  );
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!session) navigate({ to: "/login" });
  }, [session, navigate]);

  // ⌘K / Ctrl+K to focus search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MESSAGES.filter(
      (m) =>
        !q ||
        m.subject.toLowerCase().includes(q) ||
        m.from.name.toLowerCase().includes(q) ||
        m.preview.toLowerCase().includes(q),
    );
  }, [query]);

  const active = filtered.find((m) => m.id === activeMessageId) ?? filtered[0] ?? null;

  function handleLogout() {
    const s = getSession();
    if (s) recordAuditEvent({ tenantId: s.tenantId, type: "logout", email: s.email });
    clearSession();
    setSess(null);
    toast.success("Signed out");
    navigate({ to: "/login" });
  }

  const initials = (session?.displayName ?? "You")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (!session) return null;

  const primaryFolders = FOLDERS.filter((f) => PRIMARY_FOLDER_IDS.includes(f.id));
  const systemFolders = FOLDERS.filter((f) => !PRIMARY_FOLDER_IDS.includes(f.id));

  return (
    <div className="flex h-dvh w-full flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-3 sm:gap-3 sm:px-4">
        <button
          className="icon-btn lg:hidden"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label="Toggle sidebar"
        >
          <Menu className="h-4 w-4" />
        </button>

        <Link to="/mail" className="flex shrink-0 items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg text-primary-foreground shadow-sm"
            style={{ background: "var(--primary)" }}
          >
            <Inbox className="h-4 w-4" />
          </div>
          <span className="hidden text-sm font-semibold tracking-tight text-foreground sm:inline">
            {tenant.name}
          </span>
        </Link>

        <div className="relative mx-auto w-full max-w-2xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search mail, people, attachments…"
            aria-label="Search mail"
            className="h-9 rounded-full border-transparent bg-muted pl-9 pr-16 transition focus-visible:border-ring focus-visible:bg-card"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
            <span className="text-[11px]">⌘</span>K
          </kbd>
        </div>

        <NotificationDrawer />

        <button onClick={toggle} aria-label="Toggle theme" className="icon-btn">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <Link
          to="/settings"
          className="icon-btn hidden sm:inline-flex"
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
        </Link>

        {session.role !== "user" && (
          <Link
            to={session.role === "super_admin" ? "/super-admin" : "/admin"}
            className="icon-btn hidden sm:inline-flex"
            aria-label="Admin"
          >
            {session.role === "super_admin" ? <Globe2 className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
          </Link>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="ml-1 flex items-center gap-1.5 rounded-full p-0.5 pr-2 transition hover:bg-muted"
              aria-label="Open user menu"
            >
              <Avatar className="h-8 w-8 ring-1 ring-border">
                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
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
            {session.role !== "user" && (
              <DropdownMenuItem asChild>
                <Link
                  to={session.role === "super_admin" ? "/super-admin" : "/admin"}
                  className="cursor-pointer"
                >
                  <User className="h-4 w-4" />
                  {session.role === "super_admin" ? "Platform admin" : "Company admin"}
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setLogoutOpen(true)}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Body */}
      <div className="relative flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside
          className={cn(
            "absolute inset-y-0 left-0 z-30 flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 lg:static lg:translate-x-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between p-3 lg:hidden">
            <span className="text-sm font-semibold">Menu</span>
            <button onClick={() => setSidebarOpen(false)} className="icon-btn h-8 w-8">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-3">
            <Button
              className="w-full justify-start gap-2 shadow-sm"
              size="lg"
              onClick={() => {
                setReplyDefaults(null);
                setComposerOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Compose
            </Button>
          </div>

          <nav className="flex-1 space-y-4 overflow-y-auto px-2 pb-4">
            <FolderGroup
              label="Mailbox"
              folders={primaryFolders}
              activeFolder={activeFolder}
              onSelect={(id) => {
                setActiveFolder(id);
                setSidebarOpen(false);
              }}
            />
            <FolderGroup
              label="More"
              folders={systemFolders}
              activeFolder={activeFolder}
              onSelect={(id) => {
                setActiveFolder(id);
                setSidebarOpen(false);
              }}
            />
          </nav>

          <div className="border-t border-sidebar-border p-3">
            <div className="rounded-xl bg-sidebar-accent/70 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-sidebar-accent-foreground">
                <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
                Modules coming soon
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Contacts, Calendar, Tasks, AI Assistant & Email Guard.
              </p>
            </div>
          </div>
        </aside>

        {sidebarOpen && (
          <div
            className="absolute inset-0 z-20 bg-background/60 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Message list */}
        <section
          className={cn(
            "flex w-full min-w-0 flex-col border-r border-border bg-surface md:w-[380px] md:shrink-0",
            detailOpen && "hidden md:flex",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <div className="flex min-w-0 items-baseline gap-2">
              <h2 className="truncate text-sm font-semibold capitalize tracking-tight">{activeFolder}</h2>
              <span className="text-xs text-muted-foreground">{filtered.length}</span>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => toast("Sort — coming soon")}
                className="icon-btn h-8 w-8"
                aria-label="Sort"
                title="Sort"
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setDensity((d) => (d === "comfortable" ? "compact" : "comfortable"))}
                className="icon-btn h-8 w-8"
                aria-label={`Switch to ${density === "comfortable" ? "compact" : "comfortable"} density`}
                title="Density"
              >
                {density === "comfortable" ? <Rows3 className="h-3.5 w-3.5" /> : <Rows2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtered.map((m) => (
              <MessageRow
                key={m.id}
                message={m}
                active={active?.id === m.id}
                density={density}
                starred={!!starred[m.id]}
                onToggleStar={() =>
                  setStarred((prev) => ({ ...prev, [m.id]: !prev[m.id] }))
                }
                onClick={() => {
                  setActiveMessageId(m.id);
                  setDetailOpen(true);
                }}
              />
            ))}
            {filtered.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Search className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">No matches</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Nothing found for &ldquo;{query}&rdquo;.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Detail */}
        <section
          className={cn(
            "flex min-w-0 flex-1 flex-col bg-background",
            !detailOpen && "hidden md:flex",
          )}
        >
          {active ? (
            <MessageDetail
              message={active}
              starred={!!starred[active.id]}
              onToggleStar={() =>
                setStarred((prev) => ({ ...prev, [active.id]: !prev[active.id] }))
              }
              onBack={() => setDetailOpen(false)}
              onReply={() => {
                setReplyDefaults({ to: active.from.email, subject: `Re: ${active.subject}` });
                setComposerOpen(true);
              }}
              onForward={() => {
                setReplyDefaults({ to: "", subject: `Fwd: ${active.subject}` });
                setComposerOpen(true);
              }}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Inbox className="h-6 w-6" />
              </div>
              <p className="text-sm">Select a message to read</p>
            </div>
          )}
        </section>
      </div>

      <Composer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        defaultTo={replyDefaults?.to}
        defaultSubject={replyDefaults?.subject}
      />

      <ConfirmDialog
        open={logoutOpen}
        onOpenChange={setLogoutOpen}
        title="Sign out?"
        description="You will be signed out of Nyota Inbox and returned to the login page."
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        onConfirm={handleLogout}
        variant="destructive"
      />
    </div>
  );
}

function FolderGroup({
  label,
  folders,
  activeFolder,
  onSelect,
}: {
  label: string;
  folders: typeof FOLDERS;
  activeFolder: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <div className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="space-y-0.5">
        {folders.map((f) => {
          const Icon = FOLDER_ICONS[f.id] ?? Inbox;
          const isActive = activeFolder === f.id;
          return (
            <button
              key={f.id}
              onClick={() => onSelect(f.id)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-xs"
                  : "text-sidebar-foreground hover:bg-sidebar-accent",
              )}
            >
              {isActive && (
                <span
                  aria-hidden
                  className="absolute inset-y-1.5 left-0 w-0.5 rounded-r bg-sidebar-primary-foreground/60"
                />
              )}
              <span className="flex items-center gap-3">
                <Icon className="h-4 w-4" />
                {f.name}
              </span>
              {f.unread > 0 && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    isActive
                      ? "bg-sidebar-primary-foreground/20 text-sidebar-primary-foreground"
                      : "bg-primary/10 text-primary",
                  )}
                >
                  {f.unread}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MessageRow({
  message,
  active,
  density,
  starred,
  onToggleStar,
  onClick,
}: {
  message: MailMessage;
  active: boolean;
  density: "comfortable" | "compact";
  starred: boolean;
  onToggleStar: () => void;
  onClick: () => void;
}) {
  const initials = message.from.name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "group relative flex w-full cursor-pointer gap-3 border-b border-border/60 px-4 text-left transition-colors",
        density === "comfortable" ? "py-3" : "py-2",
        active ? "bg-primary/[0.06]" : "hover:bg-muted/50",
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute inset-y-1.5 left-0 w-0.5 rounded-r bg-primary"
        />
      )}

      {density === "comfortable" && (
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarFallback
            className="text-[11px] font-semibold text-foreground/80"
            style={{ background: toneFor(message.from.email) }}
          >
            {initials}
          </AvatarFallback>
        </Avatar>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {message.unread && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />
            )}
            <span
              className={cn(
                "truncate text-sm",
                message.unread ? "font-semibold text-foreground" : "text-foreground/80",
              )}
            >
              {message.from.name}
            </span>
          </div>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {formatMailDate(message.date)}
          </span>
        </div>
        <div
          className={cn(
            "mt-0.5 truncate text-sm",
            message.unread ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {message.subject}
        </div>
        {density === "comfortable" && (
          <div className="mt-0.5 flex items-center gap-2">
            <p className="truncate text-xs text-muted-foreground">{message.preview}</p>
            {message.hasAttachment && (
              <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
          </div>
        )}
      </div>

      {/* Hover actions */}
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-border bg-card px-1 py-1 opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar();
          }}
          aria-label={starred ? "Unstar" : "Star"}
          className="icon-btn h-7 w-7"
          title={starred ? "Unstar" : "Star"}
        >
          <Star
            className={cn("h-3.5 w-3.5", starred && "fill-accent text-accent")}
          />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toast("Archived");
          }}
          aria-label="Archive"
          className="icon-btn h-7 w-7"
          title="Archive"
        >
          <Archive className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toast("Moved to trash");
          }}
          aria-label="Delete"
          className="icon-btn h-7 w-7"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Non-hover star (persistent) */}
      {starred && (
        <span className="pointer-events-none absolute right-3 top-3 opacity-100 group-hover:opacity-0">
          <Star className="h-3.5 w-3.5 fill-accent text-accent" />
        </span>
      )}
    </div>
  );
}

function MessageDetail({
  message,
  starred,
  onToggleStar,
  onBack,
  onReply,
  onForward,
}: {
  message: MailMessage;
  starred: boolean;
  onToggleStar: () => void;
  onBack: () => void;
  onReply: () => void;
  onForward: () => void;
}) {
  const initials = message.from.name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
      <div className="flex items-center gap-1 border-b border-border px-3 py-2 md:px-6">
        <button
          onClick={onBack}
          className="icon-btn md:hidden"
          aria-label="Back to inbox"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex flex-1 flex-wrap items-center gap-1">
          <div className="inline-flex overflow-hidden rounded-lg border border-border bg-card shadow-xs">
            <button
              onClick={onReply}
              className="flex items-center gap-1.5 border-r border-border px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted"
            >
              <Reply className="h-3.5 w-3.5" /> Reply
            </button>
            <button
              onClick={onReply}
              className="flex items-center gap-1.5 border-r border-border px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted"
              aria-label="Reply all"
              title="Reply all"
            >
              <ReplyAll className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onForward}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted"
            >
              <Forward className="h-3.5 w-3.5" /> Forward
            </button>
          </div>
          <div className="ml-1 flex items-center gap-0.5">
            <button
              onClick={onToggleStar}
              className="icon-btn h-8 w-8"
              aria-label={starred ? "Unstar" : "Star"}
              title={starred ? "Unstar" : "Star"}
            >
              <Star className={cn("h-4 w-4", starred && "fill-accent text-accent")} />
            </button>
            <button
              onClick={() => toast("Archived")}
              className="icon-btn h-8 w-8"
              aria-label="Archive"
              title="Archive"
            >
              <Archive className="h-4 w-4" />
            </button>
            <button
              onClick={() => toast("Moved to trash")}
              className="icon-btn h-8 w-8 hover:text-destructive"
              aria-label="Delete"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => toast("More actions — pending")}
              className="icon-btn h-8 w-8"
              aria-label="More actions"
              title="More"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-5 py-8 md:px-10 md:py-10">
          <h1 className="text-2xl font-semibold leading-tight tracking-tight md:text-[28px]">
            {message.subject}
          </h1>

          <div className="mt-6 flex items-start gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback
                className="text-sm font-semibold text-foreground/80"
                style={{ background: toneFor(message.from.email) }}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="truncate text-sm font-semibold">{message.from.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  &lt;{message.from.email}&gt;
                </span>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                to {message.to.join(", ")}
              </div>
            </div>
            <div className="shrink-0 text-right text-xs text-muted-foreground">
              {new Date(message.date).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>

          <article className="mt-8 whitespace-pre-wrap text-[15px] leading-[1.7] text-foreground/90">
            {message.body}
          </article>

          {message.hasAttachment && (
            <div className="mt-10">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                1 attachment
              </div>
              <div className="group flex max-w-md items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm transition hover:shadow-md">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-primary"
                  style={{ background: "oklch(from var(--primary) calc(l + 0.4) c h / 0.15)" }}
                >
                  <Paperclip className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">contract-v3.pdf</div>
                  <div className="text-xs text-muted-foreground">248 KB · PDF</div>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={() => toast("Preview — pending")}
                    className="icon-btn h-8 w-8"
                    aria-label="Preview"
                  >
                    <Printer className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => toast("Download — pending")}
                    className="icon-btn h-8 w-8"
                    aria-label="Download"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Quick reply prompt */}
          <div className="mt-10 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Quick reply:</span>
              {["Thanks!", "Sounds good.", "I'll get back to you."].map((t) => (
                <button
                  key={t}
                  onClick={onReply}
                  className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground transition hover:border-primary hover:text-primary"
                >
                  {t}
                </button>
              ))}
              <div className="ml-auto flex gap-1">
                <Button variant="outline" size="sm" onClick={onReply}>
                  <Reply className="mr-1 h-3.5 w-3.5" /> Reply
                </Button>
                <Button variant="outline" size="sm" onClick={onForward}>
                  <Forward className="mr-1 h-3.5 w-3.5" /> Forward
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
