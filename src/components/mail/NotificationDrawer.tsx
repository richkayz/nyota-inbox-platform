import { useEffect, useState } from "react";
import { Bell, Mail, CheckCheck } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useMailEvents } from "@/lib/api/sse";

interface Note {
  id: string;
  title: string;
  body: string;
  at: number;
  unread: boolean;
}

function relTime(at: number) {
  const s = Math.floor((Date.now() - at) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

export function NotificationDrawer() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  useMailEvents((folder, count) => {
    setNotes((prev) => [
      {
        id: `n-${Date.now()}-${Math.random()}`,
        title: `${count} new message${count > 1 ? "s" : ""}`,
        body: `Arrived in ${folder}.`,
        at: Date.now(),
        unread: true,
      },
      ...prev,
    ].slice(0, 30));
  });

  // periodic re-render so relative timestamps refresh
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const unread = notes.filter((n) => n.unread).length;
  const visible = filter === "unread" ? notes.filter((n) => n.unread) : notes;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          className="icon-btn relative"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="border-b border-border px-5 py-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base">Notifications</SheetTitle>
            <button
              onClick={() => setNotes((prev) => prev.map((n) => ({ ...n, unread: false })))}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40"
              disabled={unread === 0}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          </div>
          <div className="mt-3 inline-flex rounded-lg bg-muted p-0.5 text-xs">
            {(["all", "unread"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-md px-3 py-1 font-medium capitalize transition",
                  filter === f
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f}
                {f === "unread" && unread > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">
                    {unread}
                  </span>
                )}
              </button>
            ))}
          </div>
        </SheetHeader>
        <div className="space-y-1.5 overflow-y-auto p-3">
          {visible.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              You&rsquo;re all caught up.
            </div>
          )}
          {visible.map((n) => (
            <button
              key={n.id}
              onClick={() =>
                setNotes((prev) => prev.map((x) => (x.id === n.id ? { ...x, unread: false } : x)))
              }
              className={cn(
                "flex w-full gap-3 rounded-xl border p-3 text-left transition",
                n.unread
                  ? "border-primary/20 bg-primary/[0.03] hover:bg-primary/[0.06]"
                  : "border-border bg-card hover:bg-muted/50",
              )}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Mail className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cn("truncate text-sm", n.unread ? "font-semibold" : "font-medium")}>
                    {n.title}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{relTime(n.at)}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
              </div>
              {n.unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
