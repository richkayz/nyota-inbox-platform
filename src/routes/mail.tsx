import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import { useTenant } from "@/components/branding/BrandProvider";
import { useTheme } from "@/components/theme/ThemeProvider";
import { clearSession, getSession } from "@/lib/mock-auth";
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

export const Route = createFileRoute("/mail")({
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

  useEffect(() => {
    if (!session) navigate({ to: "/login" });
  }, [session, navigate]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MESSAGES.filter((m) => !q || m.subject.toLowerCase().includes(q) || m.from.name.toLowerCase().includes(q) || m.preview.toLowerCase().includes(q));
  }, [query]);

  const active = filtered.find((m) => m.id === activeMessageId) ?? filtered[0] ?? null;

  function handleLogout() {
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

  return (
    <div className="flex h-screen w-full flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-3 sm:px-4">
        <button
          className="rounded-md p-2 text-muted-foreground hover:bg-muted lg:hidden"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label="Toggle sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg text-primary-foreground"
            style={{ background: "var(--primary)" }}
          >
            <Inbox className="h-4 w-4" />
          </div>
          <span className="hidden text-sm font-semibold tracking-tight text-foreground sm:inline">
            {tenant.name}
          </span>
        </div>

        <div className="relative mx-auto w-full max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search mail…"
            className="h-9 rounded-full border-transparent bg-muted pl-9 focus-visible:border-ring focus-visible:bg-card"
          />
        </div>

        <NotificationDrawer />

        <button
          onClick={toggle}
          aria-label="Toggle theme"
          className="rounded-md p-2 text-muted-foreground hover:bg-muted"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <Link
          to="/settings"
          className="hidden rounded-md p-2 text-muted-foreground hover:bg-muted sm:inline-flex"
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
        </Link>

        {session.role !== "user" && (
          <Link
            to={session.role === "super_admin" ? "/super-admin" : "/admin"}
            className="hidden rounded-md p-2 text-muted-foreground hover:bg-muted sm:inline-flex"
            aria-label="Admin"
          >
            {session.role === "super_admin" ? <Globe2 className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
          </Link>
        )}

        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <button
            onClick={handleLogout}
            className="hidden rounded-md p-2 text-muted-foreground hover:bg-muted sm:inline-flex"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="relative flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside
          className={cn(
            "absolute inset-y-0 left-0 z-30 flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-transform lg:static lg:translate-x-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between p-3 lg:hidden">
            <span className="text-sm font-semibold">Menu</span>
            <button onClick={() => setSidebarOpen(false)} className="rounded-md p-1 hover:bg-sidebar-accent">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-3">
            <Button
              className="w-full justify-start gap-2"
              size="lg"
              onClick={() => { setReplyDefaults(null); setComposerOpen(true); }}
            >
              <Plus className="h-4 w-4" /> Compose
            </Button>
          </div>

          <nav className="flex-1 space-y-0.5 px-2">
            {FOLDERS.map((f) => {
              const Icon = FOLDER_ICONS[f.id] ?? Inbox;
              const isActive = activeFolder === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => {
                    setActiveFolder(f.id);
                    setSidebarOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent",
                  )}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-4 w-4" />
                    {f.name}
                  </span>
                  {f.unread > 0 && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
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
          </nav>

          <div className="border-t border-sidebar-border p-3">
            <div className="rounded-lg bg-sidebar-accent p-3">
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
            "flex w-full min-w-0 flex-col border-r border-border bg-surface md:w-96 md:shrink-0",
            detailOpen && "hidden md:flex",
          )}
        >
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-sm font-semibold capitalize tracking-tight">{activeFolder}</h2>
            <span className="text-xs text-muted-foreground">{filtered.length} messages</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtered.map((m) => (
              <MessageRow
                key={m.id}
                message={m}
                active={active?.id === m.id}
                onClick={() => {
                  setActiveMessageId(m.id);
                  setDetailOpen(true);
                }}
              />
            ))}
            {filtered.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No messages match &ldquo;{query}&rdquo;.
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
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Select a message
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
    </div>
  );
}

function MessageRow({
  message,
  active,
  onClick,
}: {
  message: MailMessage;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "block w-full border-b border-border px-4 py-3 text-left transition-colors",
        active ? "bg-primary/5" : "hover:bg-muted/60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {message.unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
          <span
            className={cn(
              "truncate text-sm",
              message.unread ? "font-semibold text-foreground" : "text-foreground/80",
            )}
          >
            {message.from.name}
          </span>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{formatMailDate(message.date)}</span>
      </div>
      <div
        className={cn(
          "mt-0.5 truncate text-sm",
          message.unread ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {message.subject}
      </div>
      <div className="mt-0.5 flex items-center gap-2">
        <p className="truncate text-xs text-muted-foreground">{message.preview}</p>
        {message.hasAttachment && <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />}
      </div>
    </button>
  );
}

function MessageDetail({ message, onBack, onReply, onForward }: { message: MailMessage; onBack: () => void; onReply: () => void; onForward: () => void }) {
  const initials = message.from.name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 md:px-6">
        <button
          onClick={onBack}
          className="rounded-md p-2 text-muted-foreground hover:bg-muted md:hidden"
          aria-label="Back"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex flex-1 flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onReply}>
            <Reply className="mr-1 h-4 w-4" /> Reply
          </Button>
          <Button variant="outline" size="sm" onClick={onForward}>
            <Forward className="mr-1 h-4 w-4" /> Forward
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => toast("Delete — coming next module")}
          >
            <Trash2 className="mr-1 h-4 w-4" /> Delete
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{message.subject}</h1>

        <div className="mt-5 flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-sm font-semibold">{message.from.name}</span>
              <span className="truncate text-xs text-muted-foreground">&lt;{message.from.email}&gt;</span>
            </div>
            <div className="text-xs text-muted-foreground">
              To: {message.to.join(", ")} · {new Date(message.date).toLocaleString()}
            </div>
          </div>
        </div>

        <article className="prose prose-sm mt-6 max-w-none whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
          {message.body}
        </article>

        {message.hasAttachment && (
          <div className="mt-8 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <div className="text-sm font-medium">contract-v3.pdf</div>
                <div className="text-xs text-muted-foreground">248 KB · PDF</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
