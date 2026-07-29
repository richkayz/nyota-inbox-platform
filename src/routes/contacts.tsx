import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Star, Trash2, Plus, Loader2, Users } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionStatus } from "@/lib/mock-auth";
import { useContactsInfinite, useRemoveContact, useUpsertContact } from "@/lib/api/queries";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/contacts")({
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
      { title: "Contacts — Nyota Inbox" },
      { name: "description", content: "Your address book, live from the gateway." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ContactsPage,
});

function initialsOf(name: string) {
  return name.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
}

function ContactsPage() {
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(queryInput.trim()), 300);
    return () => clearTimeout(t);
  }, [queryInput]);

  const q = useContactsInfinite(query || undefined);
  const remove = useRemoveContact();

  const contacts = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);

  return (
    <AppShell title="Contacts">
      <div className="mx-auto max-w-4xl p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Search contacts…"
              className="pl-9"
            />
            {queryInput && q.isFetching && (
              <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add contact
          </Button>
        </div>

        <div
          ref={scrollRef}
          className="max-h-[calc(100dvh-14rem)] overflow-y-auto rounded-xl border border-border bg-card shadow-sm"
          onScroll={(e) => {
            const el = e.currentTarget;
            if (
              el.scrollTop + el.clientHeight >= el.scrollHeight - 240 &&
              q.hasNextPage &&
              !q.isFetchingNextPage
            ) {
              q.fetchNextPage();
            }
          }}
        >
          {q.isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                </div>
              ))}
            </div>
          ) : q.isError ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Couldn't load contacts.
              <div className="mt-3">
                <Button variant="outline" size="sm" onClick={() => q.refetch()}>Try again</Button>
              </div>
            </div>
          ) : contacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  {query ? "No matches" : "No contacts yet"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {query ? `Nothing found for “${query}”.` : "Add your first contact to get started."}
                </p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {contacts.map((c) => (
                <li
                  key={c.id}
                  className="group flex items-center gap-3 px-4 py-3 transition hover:bg-muted/40"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                      {initialsOf(c.name ?? c.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{c.name || c.email}</span>
                      {c.starred && <Star className="h-3.5 w-3.5 fill-accent text-accent" />}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{c.email}</div>
                  </div>
                  <div className={cn("flex items-center gap-1 opacity-0 transition group-hover:opacity-100")}>
                    <button
                      onClick={() =>
                        remove.mutate(c.id, {
                          onSuccess: () => toast("Contact removed"),
                          onError: () => toast.error("Couldn't remove contact"),
                        })
                      }
                      className="icon-btn h-8 w-8 hover:text-destructive"
                      aria-label={`Delete ${c.email}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
              {q.hasNextPage && (
                <li className="flex items-center justify-center gap-2 p-4 text-xs text-muted-foreground">
                  {q.isFetchingNextPage ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading more…
                    </>
                  ) : (
                    <button onClick={() => q.fetchNextPage()} className="text-primary hover:underline">
                      Load more
                    </button>
                  )}
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      <AddContactDialog open={addOpen} onOpenChange={setAddOpen} />
    </AppShell>
  );
}

function AddContactDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const upsert = useUpsertContact();

  useEffect(() => {
    if (!open) {
      setEmail("");
      setName("");
    }
  }, [open]);

  async function handleSave() {
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }
    try {
      await upsert.mutateAsync({ email: email.trim(), name: name.trim() || undefined });
      toast.success("Contact saved");
      onOpenChange(false);
    } catch (err) {
      toast.error("Couldn't save contact", { description: (err as Error).message });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add contact</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="c-email">Email</Label>
            <Input
              id="c-email"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-name">Name (optional)</Label>
            <Input
              id="c-name"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={upsert.isPending}>
            {upsert.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
