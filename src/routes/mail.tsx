import { createFileRoute, useNavigate, Link, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
  WifiOff,
  Loader2,
} from "lucide-react";
import DOMPurify from "dompurify";
import { useTenant } from "@/components/branding/BrandProvider";
import { useTheme } from "@/components/theme/ThemeProvider";
import { clearSession, getSession, getSessionStatus } from "@/lib/mock-auth";
import { recordAuditEvent } from "@/lib/audit-log";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
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
import { mailClient } from "@/lib/api/client";
import type { FolderSummary, MessageListItem, MessageDetail } from "@/lib/api/types";
import {
  useFolders,
  useMessagesInfinite,
  useMessage,
  useSetFlags,
  useMove,
  useRemoveMessage,
} from "@/lib/api/queries";
import { useMailEvents } from "@/lib/api/sse";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/mail")({
  loader: ({ context }) => {
    context.queryClient.prefetchQuery({
      queryKey: ["folders"],
      queryFn: () => mailClient.listFolders(),
    });
  },
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
  archive: Archive,
};

const PRIMARY_FOLDER_IDS = ["inbox", "starred", "sent", "drafts"];

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

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatMailDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  if (d.getFullYear() === now.getFullYear())
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Sanitizes remote email HTML, neutralises layout-breaking markup and (unless
 * the reader opted in) defuses remote images so senders can't track opens.
 * Inline `cid:`/`data:` images are always shown — they ship with the message.
 */
function sanitizeEmailHtml(html: string, allowRemoteImages: boolean): { html: string; blocked: number } {
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "link", "meta", "base"],
    FORBID_ATTR: ["srcdoc", "onerror", "onload", "background"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|cid|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });

  const doc = new DOMParser().parseFromString(clean, "text/html");
  let blocked = 0;
  if (!allowRemoteImages) {
    doc.querySelectorAll("img[src]").forEach((img) => {
      const src = img.getAttribute("src") ?? "";
      if (/^https?:/i.test(src)) {
        img.setAttribute("data-blocked-src", src);
        img.removeAttribute("src");
        img.setAttribute("data-blocked", "true");
        blocked += 1;
      }
    });
  }
  doc.querySelectorAll("a[href]").forEach((a) => {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer nofollow");
  });
  return { html: doc.body.innerHTML, blocked };
}

/** Gmail-style quoted original for replies and forwards. */
function buildQuotedHtml(
  summary: MessageListItem,
  detail: MessageDetail | undefined,
  mode: "reply" | "forward",
): string {
  const when = new Date(summary.date).toLocaleString();
  const who = `${escapeHtml(summary.from.name ?? summary.from.address)} &lt;${escapeHtml(summary.from.address)}&gt;`;
  const rawHtml = detail?.bodyHtml ?? detail?.html;
  const rawText = detail?.bodyText ?? detail?.text ?? summary.snippet ?? summary.preview ?? "";
  const body = rawHtml
    ? sanitizeEmailHtml(rawHtml, true).html
    : escapeHtml(rawText).replace(/\n/g, "<br>");

  if (mode === "forward") {
    const to = (detail?.to ?? summary.to).map((r) => escapeHtml(r.address)).join(", ");
    return (
      `<br><br><div class="nyota-quote">` +
      `<p>---------- Forwarded message ----------</p>` +
      `<p>From: ${who}<br>Date: ${escapeHtml(when)}<br>` +
      `Subject: ${escapeHtml(summary.subject || "(no subject)")}<br>To: ${to}</p>` +
      `${body}</div>`
    );
  }
  return `<br><br><div class="nyota-quote"><p>On ${escapeHtml(when)}, ${who} wrote:</p>${body}</div>`;
}


function MailShell() {
  const tenant = useTenant();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [session, setSess] = useState(() => getSession());
  const [activeFolder, setActiveFolder] = useState("inbox");
  const [activeUid, setActiveUid] = useState<number | null>(null);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [replyDefaults, setReplyDefaults] = useState<{
    to?: string;
    cc?: string;
    subject?: string;
    body?: string;
    html?: string;
    inReplyTo?: string;
    references?: string[];
  } | null>(null);

  const [logoutOpen, setLogoutOpen] = useState(false);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const searchRef = useRef<HTMLInputElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);

  // Live data hooks
  const foldersQ = useFolders();
  const messagesQ = useMessagesInfinite(activeFolder, query || undefined);
  const detailQ = useMessage(detailOpen ? activeFolder : null, detailOpen ? activeUid : null);

  const setFlags = useSetFlags();
  const move = useMove();
  const remove = useRemoveMessage();

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setQuery(queryInput.trim()), 350);
    return () => clearTimeout(t);
  }, [queryInput]);

  // Reset selection when switching folder / search
  useEffect(() => {
    setActiveUid(null);
    setDetailOpen(false);
    listScrollRef.current?.scrollTo({ top: 0 });
  }, [activeFolder, query]);

  // Real-time — invalidate on SSE
  useMailEvents(
    useCallback(
      (folder: string, count: number) => {
        if (folder !== activeFolder) {
          toast(`${count} new message${count > 1 ? "s" : ""} in ${folder}`);
        }
      },
      [activeFolder],
    ),
  );

  useEffect(() => {
    if (!session) navigate({ to: "/login" });
  }, [session, navigate]);

  // ⌘K / Ctrl+K
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

  useEffect(() => {
    function on() { setOnline(true); }
    function off() { setOnline(false); }
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const messages: MessageListItem[] = useMemo(
    () => messagesQ.data?.pages.flatMap((p) => p.items) ?? [],
    [messagesQ.data],
  );

  const showRecipients = useMemo(
    () => ["sent", "drafts"].includes(activeFolder.toLowerCase()) ||
      ["sent", "drafts"].includes(
        (foldersQ.data?.find((f) => f.path === activeFolder)?.role ?? "").toLowerCase(),
      ),
    [activeFolder, foldersQ.data],
  );

  const active = useMemo(
    () => messages.find((m) => m.uid === activeUid) ?? null,
    [messages, activeUid],
  );

  function handleLogout() {
    const s = getSession();
    if (s) recordAuditEvent({ tenantId: s.tenantId, type: "logout", email: s.email });
    mailClient.logout().catch(() => undefined);
    clearSession();
    qc.clear();
    setSess(null);
    toast.success("Signed out");
    navigate({ to: "/login" });
  }

  function openMessage(m: MessageListItem) {
    setActiveUid(m.uid);
    setDetailOpen(true);
    if (m.unread) {
      setFlags.mutate({ folder: activeFolder, uid: m.uid, add: ["\\Seen"] });
    }
  }

  function toggleStar(m: MessageListItem) {
    setFlags.mutate({
      folder: activeFolder,
      uid: m.uid,
      ...(m.starred ? { remove: ["\\Flagged"] } : { add: ["\\Flagged"] }),
    });
  }

  function archiveMessage(m: MessageListItem) {
    move.mutate(
      { folder: m.folder, uid: m.uid, target: "archive" },
      {
        onSuccess: () => toast("Archived"),
        onError: () => toast.error("Couldn't archive message"),
      },
    );
    if (activeUid === m.uid) setDetailOpen(false);
  }

  function spamMessage(m: MessageListItem) {
    move.mutate(
      { folder: m.folder, uid: m.uid, target: "spam" },
      {
        onSuccess: () => toast("Marked as spam"),
        onError: () => toast.error("Couldn't move to spam"),
      },
    );
    if (activeUid === m.uid) setDetailOpen(false);
  }

  function deleteMessage(m: MessageListItem) {
    remove.mutate(
      { folder: m.folder, uid: m.uid },
      {
        onSuccess: () => toast("Moved to trash"),
        onError: () => toast.error("Couldn't delete message"),
      },
    );
    if (activeUid === m.uid) setDetailOpen(false);
  }

  /**
   * Opens the composer pre-filled Gmail-style: correct recipients for
   * reply / reply-all / forward, the original quoted below, and threading
   * headers so the reply lands in the same conversation.
   */
  function startCompose(mode: "reply" | "replyAll" | "forward", body?: string) {
    if (!active) return;
    const detail = detailQ.data;
    const self = (session?.email ?? "").toLowerCase();
    const replyTo = detail?.replyTo?.[0]?.address ?? active.from.address;
    const messageId = detail?.headers?.["message-id"] ?? detail?.headers?.["Message-ID"];
    const priorRefs = (detail?.headers?.["references"] ?? detail?.headers?.["References"] ?? "")
      .split(/\s+/)
      .filter(Boolean);

    if (mode === "forward") {
      setReplyDefaults({
        subject: /^fwd?:/i.test(active.subject) ? active.subject : `Fwd: ${active.subject}`,
        html: buildQuotedHtml(active, detail, "forward"),
      });
    } else {
      const everyone = [
        ...(detail?.to ?? active.to),
        ...(detail?.cc ?? []),
      ]
        .map((r) => r.address)
        .filter((a) => a && a.toLowerCase() !== self && a.toLowerCase() !== replyTo.toLowerCase());
      setReplyDefaults({
        to: replyTo,
        cc: mode === "replyAll" ? Array.from(new Set(everyone)).join(", ") : undefined,
        subject: /^re:/i.test(active.subject) ? active.subject : `Re: ${active.subject}`,
        body,
        html: buildQuotedHtml(active, detail, "reply"),
        inReplyTo: messageId,
        references: messageId ? [...priorRefs, messageId] : priorRefs,
      });
    }
    setComposerOpen(true);
  }


  const initials = initialsOf(session?.displayName ?? "You");
  if (!session) return null;

  const folders: FolderSummary[] = foldersQ.data ?? [];
  const primaryFolders = folders.filter((f) => PRIMARY_FOLDER_IDS.includes(f.path));
  const systemFolders = folders.filter((f) => !PRIMARY_FOLDER_IDS.includes(f.path));

  return (
    <div className="flex h-dvh w-full flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-3 sm:gap-3 sm:px-4">
        <button className="icon-btn lg:hidden" onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle sidebar">
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
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Search mail, people, attachments…"
            aria-label="Search mail"
            className="h-9 rounded-full border-transparent bg-muted pl-9 pr-16 transition focus-visible:border-ring focus-visible:bg-card"
          />
          {queryInput && messagesQ.isFetching ? (
            <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : (
            <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
              <span className="text-[11px]">⌘</span>K
            </kbd>
          )}
        </div>

        {!online && (
          <div className="hidden items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive sm:flex">
            <WifiOff className="h-3 w-3" /> Offline
          </div>
        )}

        <NotificationDrawer />

        <button onClick={toggle} aria-label="Toggle theme" className="icon-btn">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <Link to="/settings" className="icon-btn hidden sm:inline-flex" aria-label="Settings">
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
            <button className="ml-1 flex items-center gap-1.5 rounded-full p-0.5 pr-2 transition hover:bg-muted" aria-label="Open user menu">
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
                <span className="text-sm font-medium text-foreground">{session.displayName}</span>
                <span className="text-xs text-muted-foreground">{session.email}</span>
                <span className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {session.role?.replace("_", " ")}
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
              <Link to="/contacts" className="cursor-pointer">
                <User className="h-4 w-4" />
                Contacts
              </Link>
            </DropdownMenuItem>
            {session.role !== "user" && (
              <DropdownMenuItem asChild>
                <Link to={session.role === "super_admin" ? "/super-admin" : "/admin"} className="cursor-pointer">
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
            "absolute inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-sidebar-border bg-sidebar transition-transform lg:relative lg:translate-x-0",
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
            {foldersQ.isLoading ? (
              <div className="space-y-1 px-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <>
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
              </>
            )}
          </nav>

          <div className="border-t border-sidebar-border p-3">
            <div className="rounded-xl bg-sidebar-accent/70 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-sidebar-accent-foreground">
                <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
                Modules coming soon
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Calendar, Tasks, AI Assistant & Email Guard.
              </p>
            </div>
          </div>
        </aside>

        {sidebarOpen && (
          <div className="absolute inset-0 z-20 bg-background/60 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Message list */}
        <section
          className={cn(
            "flex w-full min-w-0 flex-col border-r border-border bg-surface md:w-[400px] md:shrink-0 lg:w-[440px]",
            detailOpen && "hidden md:flex",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <div className="flex min-w-0 items-baseline gap-2">
              <h2 className="truncate text-sm font-semibold capitalize tracking-tight">{activeFolder}</h2>
              <span className="text-xs text-muted-foreground">
                {folders.find((f) => f.path === activeFolder)?.totalCount ?? messages.length}
              </span>
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
          <div
            ref={listScrollRef}
            className="min-h-0 flex-1 overflow-y-auto"
            onScroll={(e) => {
              const el = e.currentTarget;
              if (
                el.scrollTop + el.clientHeight >= el.scrollHeight - 320 &&
                messagesQ.hasNextPage &&
                !messagesQ.isFetchingNextPage
              ) {
                messagesQ.fetchNextPage();
              }
            }}
          >
            {messagesQ.isLoading ? (
              <MessageListSkeleton density={density} />
            ) : messagesQ.isError ? (
              <ErrorState
                title="Couldn't load messages"
                message={(messagesQ.error as Error)?.message ?? "Please try again."}
                onRetry={() => messagesQ.refetch()}
              />
            ) : messages.length === 0 ? (
              <EmptyState query={query} folder={activeFolder} />
            ) : (
              <>
                {messages.map((m) => (
                  <MessageRow
                    key={`${m.folder}-${m.uid}`}
                    message={m}
                    active={active?.uid === m.uid}
                    density={density}
                    showRecipients={showRecipients}
                    onClick={() => openMessage(m)}
                    onToggleStar={() => toggleStar(m)}
                    onArchive={() => archiveMessage(m)}
                    onDelete={() => deleteMessage(m)}
                  />
                ))}
                {messagesQ.hasNextPage && (
                  <div className="flex items-center justify-center gap-2 border-t border-border/60 p-4 text-xs text-muted-foreground">
                    {messagesQ.isFetchingNextPage ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading more…
                      </>
                    ) : (
                      <button
                        onClick={() => messagesQ.fetchNextPage()}
                        className="text-primary transition hover:underline"
                      >
                        Load more
                      </button>
                    )}
                  </div>
                )}
                {!messagesQ.hasNextPage && messages.length > 20 && (
                  <div className="p-4 text-center text-[11px] text-muted-foreground">
                    You&rsquo;ve reached the end
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* Detail */}
        <section
          className={cn("flex min-w-0 flex-1 flex-col bg-background", !detailOpen && "hidden md:flex")}
        >
          {active ? (
            <MessageDetailView
              summary={active}
              detail={detailQ.data}
              loading={detailQ.isLoading}
              error={detailQ.isError ? ((detailQ.error as Error)?.message ?? "Failed to load") : null}
              onRetry={() => detailQ.refetch()}
              onBack={() => setDetailOpen(false)}
              onToggleStar={() => toggleStar(active)}
              onArchive={() => archiveMessage(active)}
              onDelete={() => deleteMessage(active)}
              onSpam={() => spamMessage(active)}
              onReply={(body) => startCompose("reply", body)}
              onReplyAll={() => startCompose("replyAll")}
              onForward={() => startCompose("forward")}
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
        defaultCc={replyDefaults?.cc}
        defaultSubject={replyDefaults?.subject}
        defaultBody={replyDefaults?.body}
        defaultHtml={replyDefaults?.html}
        inReplyTo={replyDefaults?.inReplyTo}
        references={replyDefaults?.references}
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
  folders: FolderSummary[];
  activeFolder: string;
  onSelect: (id: string) => void;
}) {
  if (folders.length === 0) return null;
  return (
    <div>
      <div className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="space-y-0.5">
        {folders.map((f) => {
          const Icon = FOLDER_ICONS[f.path] ?? Inbox;
          const isActive = activeFolder === f.path;
          return (
            <button
              key={f.path}
              onClick={() => onSelect(f.path)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-xs"
                  : "text-sidebar-foreground hover:bg-sidebar-accent",
              )}
            >
              {isActive && (
                <span aria-hidden className="absolute inset-y-1.5 left-0 w-0.5 rounded-r bg-sidebar-primary-foreground/60" />
              )}
              <span className="flex items-center gap-3">
                <Icon className="h-4 w-4" />
                {f.name}
              </span>
              {f.unreadCount > 0 && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    isActive
                      ? "bg-sidebar-primary-foreground/20 text-sidebar-primary-foreground"
                      : "bg-primary/10 text-primary",
                  )}
                >
                  {f.unreadCount}
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
  showRecipients,
  onClick,
  onToggleStar,
  onArchive,
  onDelete,
}: {
  message: MessageListItem;
  active: boolean;
  density: "comfortable" | "compact";
  showRecipients?: boolean;
  onClick: () => void;
  onToggleStar: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const party = showRecipients
    ? message.to[0] ?? message.from
    : message.from;
  const name = party.name ?? party.address ?? "(unknown)";
  const extra = showRecipients && message.to.length > 1 ? ` +${message.to.length - 1}` : "";
  const initials = initialsOf(name);
  const snippet = message.snippet ?? message.preview ?? "";

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
        "group relative flex w-full cursor-pointer gap-3 border-b border-border/50 pl-4 pr-3 text-left transition-colors",
        density === "comfortable" ? "py-3.5" : "py-2.5",
        active ? "bg-primary/[0.07]" : message.unread ? "bg-primary/[0.02] hover:bg-muted/60" : "hover:bg-muted/50",
      )}
    >
      {active && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-primary" />}

      <Avatar className={cn("shrink-0", density === "comfortable" ? "h-10 w-10" : "h-8 w-8")}>
        <AvatarFallback
          className="text-[11px] font-semibold text-foreground/80"
          style={{ background: toneFor(party.address || name) }}
        >
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span
            className={cn(
              "truncate text-[13.5px]",
              message.unread ? "font-bold text-foreground" : "font-medium text-foreground/75",
            )}
          >
            {showRecipients ? "To: " : ""}
            {name}
            {extra}
          </span>
          <span
            className={cn(
              "shrink-0 text-[11px] tabular-nums",
              message.unread ? "font-semibold text-primary" : "text-muted-foreground",
            )}
          >
            {formatMailDate(message.date)}
          </span>
        </div>

        <div className="mt-1 flex items-center gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[13.5px]",
              message.unread ? "font-semibold text-foreground" : "text-foreground/70",
            )}
          >
            {message.subject || "(no subject)"}
          </span>
          {message.hasAttachment && (
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Has attachments" />
          )}
          {message.starred && (
            <Star className="h-3.5 w-3.5 shrink-0 fill-accent text-accent" aria-label="Starred" />
          )}
        </div>

        {density === "comfortable" && (
          <p className="mt-1 line-clamp-2 text-[12.5px] leading-[1.55] text-muted-foreground">
            {snippet || "No preview available"}
          </p>
        )}
      </div>

      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-border bg-card px-1 py-1 opacity-0 shadow-md transition group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleStar(); }}
          aria-label={message.starred ? "Unstar" : "Star"}
          title={message.starred ? "Unstar" : "Star"}
          className="icon-btn h-7 w-7"
        >
          <Star className={cn("h-3.5 w-3.5", message.starred && "fill-accent text-accent")} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onArchive(); }}
          aria-label="Archive"
          title="Archive"
          className="icon-btn h-7 w-7"
        >
          <Archive className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          aria-label="Delete"
          title="Delete"
          className="icon-btn h-7 w-7 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
function MessageListSkeleton({ density }: { density: "comfortable" | "compact" }) {
  return (
    <div>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className={cn("flex gap-3 border-b border-border/60 px-4", density === "comfortable" ? "py-3" : "py-2")}>
          {density === "comfortable" && <Skeleton className="h-9 w-9 shrink-0 rounded-full" />}
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="h-3 w-3/4" />
            {density === "comfortable" && <Skeleton className="h-3 w-2/3" />}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ query, folder }: { query: string; folder: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Search className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium">
          {query ? "No matches" : `No messages in ${folder}`}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {query ? `Nothing found for “${query}”.` : "You're all caught up."}
        </p>
      </div>
    </div>
  );
}

function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <WifiOff className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 max-w-xs text-xs text-muted-foreground">{message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function MessageDetailView({
  summary,
  detail,
  loading,
  error,
  onRetry,
  onBack,
  onToggleStar,
  onArchive,
  onDelete,
  onSpam,
  onReply,
  onReplyAll,
  onForward,
}: {
  summary: MessageListItem;
  detail: MessageDetail | undefined;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onBack: () => void;
  onToggleStar: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onSpam: () => void;
  onReply: (body?: string) => void;
  onReplyAll: () => void;
  onForward: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [showImages, setShowImages] = useState(false);
  const [showPlainText, setShowPlainText] = useState(false);
  const name = summary.from.name ?? summary.from.address;
  const initials = initialsOf(name);
  const attachments = (detail?.attachments ?? []).filter((a) => !a.inline);
  const html = detail?.bodyHtml ?? detail?.html;
  const text = detail?.bodyText ?? detail?.text;
  const cc = detail?.cc ?? [];
  const bcc = detail?.bcc ?? [];
  const recipients = detail?.to?.length ? detail.to : summary.to;

  // Reset per-message reader preferences when a different message is opened.
  useEffect(() => {
    setShowImages(false);
    setShowPlainText(false);
    setShowDetails(false);
  }, [summary.folder, summary.uid]);

  const rendered = useMemo(
    () => (html ? sanitizeEmailHtml(html, showImages) : null),
    [html, showImages],
  );
  const safeHtml = showPlainText ? null : rendered?.html ?? null;


  async function downloadAttachment(part: string, filename: string) {
    try {
      const blob = await mailClient.downloadAttachment(summary.folder, summary.uid, part);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Download failed", { description: (e as Error).message });
    }
  }

  return (
    <>
      <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-border bg-card/95 px-3 py-2 backdrop-blur md:px-8">
        <button onClick={onBack} className="icon-btn md:hidden" aria-label="Back to inbox">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex flex-1 flex-wrap items-center gap-1">
          <Button size="sm" onClick={() => onReply()} className="gap-1.5">
            <Reply className="h-3.5 w-3.5" /> Reply
          </Button>
          <Button size="sm" variant="outline" onClick={onReplyAll} className="gap-1.5">
            <ReplyAll className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Reply all</span>
          </Button>

          <Button size="sm" variant="outline" onClick={onForward} className="gap-1.5">
            <Forward className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Forward</span>
          </Button>
          <div className="ml-auto flex items-center gap-0.5">
            <button onClick={onToggleStar} className="icon-btn h-8 w-8" aria-label={summary.starred ? "Unstar" : "Star"}>
              <Star className={cn("h-4 w-4", summary.starred && "fill-accent text-accent")} />
            </button>
            <button onClick={onArchive} className="icon-btn h-8 w-8" aria-label="Archive">
              <Archive className="h-4 w-4" />
            </button>
            <button onClick={onDelete} className="icon-btn h-8 w-8 hover:text-destructive" aria-label="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="icon-btn h-8 w-8" aria-label="More actions" title="More">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={onSpam}>
                  <ShieldAlert className="h-4 w-4" /> Mark as spam
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.print()}>
                  <Printer className="h-4 w-4" /> Print
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-5 py-8 md:px-12 md:py-10">
          <h1 className="text-[22px] font-semibold leading-snug tracking-tight md:text-[28px]">
            {summary.subject || "(no subject)"}
          </h1>

          <div className="mt-7 flex items-start gap-4">
            <Avatar className="h-11 w-11 shrink-0">
              <AvatarFallback
                className="text-sm font-semibold text-foreground/80"
                style={{ background: toneFor(summary.from.address) }}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="truncate text-sm font-semibold">{name}</span>
                <span className="truncate text-xs text-muted-foreground">&lt;{summary.from.address}&gt;</span>
              </div>
              <button
                onClick={() => setShowDetails((v) => !v)}
                className="mt-1 flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
              >
                <span className="truncate">
                  to {recipients.map((r) => r.name ?? r.address).join(", ") || "—"}
                </span>
                <ChevronDown className={cn("h-3 w-3 transition", showDetails && "rotate-180")} />
              </button>
              {showDetails && (
                <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-xl border border-border bg-muted/40 p-3 text-xs">
                  <dt className="font-medium text-muted-foreground">From</dt>
                  <dd className="truncate">{summary.from.address}</dd>
                  <dt className="font-medium text-muted-foreground">To</dt>
                  <dd className="break-words">{recipients.map((r) => r.address).join(", ") || "—"}</dd>
                  {cc.length > 0 && (
                    <>
                      <dt className="font-medium text-muted-foreground">Cc</dt>
                      <dd className="break-words">{cc.map((r) => r.address).join(", ")}</dd>
                    </>
                  )}
                  {bcc.length > 0 && (
                    <>
                      <dt className="font-medium text-muted-foreground">Bcc</dt>
                      <dd className="break-words">{bcc.map((r) => r.address).join(", ")}</dd>
                    </>
                  )}
                  <dt className="font-medium text-muted-foreground">Date</dt>
                  <dd>{new Date(summary.date).toLocaleString()}</dd>
                </dl>
              )}
            </div>
            <div className="shrink-0 text-right text-xs text-muted-foreground">
              {new Date(summary.date).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>

          {!loading && !error && html && (
            <div className="mt-6 flex flex-wrap items-center gap-2">
              {!showImages && (rendered?.blocked ?? 0) > 0 && (
                <div className="flex flex-1 flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs">
                  <ImageOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {rendered!.blocked} remote image{rendered!.blocked > 1 ? "s" : ""} blocked to protect your privacy.
                  </span>
                  <Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => setShowImages(true)}>
                    Display images
                  </Button>
                </div>
              )}
              {text && (
                <button
                  onClick={() => setShowPlainText((v) => !v)}
                  className="rounded-full border border-border px-3 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-primary hover:text-primary"
                >
                  {showPlainText ? "Show formatted message" : "Show plain text"}
                </button>
              )}
            </div>
          )}

          <div className="mt-8 border-t border-border pt-8">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-10/12" />
                <Skeleton className="h-4 w-9/12" />
              </div>
            ) : error ? (
              <ErrorState title="Couldn't load message" message={error} onRetry={onRetry} />
            ) : safeHtml ? (
              <article
                className="email-body text-[15px] leading-[1.75] text-foreground/90"
                dangerouslySetInnerHTML={{ __html: safeHtml }}
              />
            ) : text ? (
              <article className="whitespace-pre-wrap break-words font-sans text-[15px] leading-[1.75] text-foreground/90">
                {text}
              </article>
            ) : summary.snippet || summary.preview ? (
              <article className="whitespace-pre-wrap text-[15px] leading-[1.75] text-foreground/90">
                {summary.snippet ?? summary.preview}
              </article>
            ) : (
              <p className="text-sm italic text-muted-foreground">This message has no readable content.</p>
            )}
          </div>


          {attachments.length > 0 && (
            <div className="mt-10">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {attachments.length} attachment{attachments.length > 1 ? "s" : ""}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm transition hover:shadow-md"
                  >
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-primary"
                      style={{ background: "oklch(from var(--primary) calc(l + 0.4) c h / 0.15)" }}
                    >
                      <Paperclip className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{att.filename}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatBytes(att.size)} · {att.contentType.split("/")[1]?.toUpperCase() ?? att.contentType}
                      </div>
                    </div>
                    <button
                      onClick={() => downloadAttachment(att.id, att.filename)}
                      className="icon-btn h-8 w-8"
                      aria-label={`Download ${att.filename}`}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

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
function formatBytes(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
