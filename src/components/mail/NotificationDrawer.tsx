import { Bell, Mail, ShieldCheck, UserPlus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

interface Note {
  id: string;
  icon: typeof Bell;
  title: string;
  body: string;
  time: string;
  unread: boolean;
}

const NOTES: Note[] = [
  { id: "n1", icon: Mail, title: "6 new messages", body: "Since your last visit.", time: "just now", unread: true },
  { id: "n2", icon: ShieldCheck, title: "Suspicious sign-in blocked", body: "From an unrecognized IP in Berlin.", time: "2h", unread: true },
  { id: "n3", icon: UserPlus, title: "Amara Okafor joined", body: "New user added to your tenant.", time: "1d", unread: false },
];

export function NotificationDrawer() {
  const unread = NOTES.filter((n) => n.unread).length;
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          className="relative rounded-md p-2 text-muted-foreground hover:bg-muted"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" />
          )}
        </button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-2">
          {NOTES.map((n) => {
            const Icon = n.icon;
            return (
              <div
                key={n.id}
                className="flex gap-3 rounded-lg border border-border bg-card p-3 transition hover:bg-muted/40"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">{n.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{n.time}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                </div>
                {n.unread && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
