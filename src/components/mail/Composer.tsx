import { useState } from "react";
import { Paperclip, Send, X, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTo?: string;
  defaultSubject?: string;
  defaultBody?: string;
}

export function Composer({ open, onOpenChange, defaultTo = "", defaultSubject = "", defaultBody = "" }: Props) {
  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!to || !subject) {
      toast.error("Recipient and subject are required");
      return;
    }
    setSending(true);
    // Mock — real impl: server fn → SMTP submission via Mail Gateway
    await new Promise((r) => setTimeout(r, 600));
    setSending(false);
    onOpenChange(false);
    toast.success("Message queued for delivery");
    setTo("");
    setCc("");
    setSubject("");
    setBody("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="flex flex-row items-center justify-between border-b border-border px-5 py-3">
          <DialogTitle className="text-sm font-semibold">New message</DialogTitle>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogHeader>

        <div className="space-y-0 divide-y divide-border">
          <div className="flex items-center gap-3 px-5 py-2">
            <label className="w-14 text-xs font-medium text-muted-foreground">To</label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@company.com" className="border-0 shadow-none focus-visible:ring-0" />
          </div>
          <div className="flex items-center gap-3 px-5 py-2">
            <label className="w-14 text-xs font-medium text-muted-foreground">Cc</label>
            <Input value={cc} onChange={(e) => setCc(e.target.value)} className="border-0 shadow-none focus-visible:ring-0" />
          </div>
          <div className="flex items-center gap-3 px-5 py-2">
            <label className="w-14 text-xs font-medium text-muted-foreground">Subject</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="border-0 shadow-none focus-visible:ring-0" />
          </div>
        </div>

        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your message…"
          className="min-h-[240px] resize-none rounded-none border-0 shadow-none focus-visible:ring-0"
        />

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-5 py-3">
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => toast("Attachments — module pending")}>
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => toast("AI compose — module pending")}>
              <Sparkles className="h-4 w-4" style={{ color: "var(--accent)" }} />
            </Button>
          </div>
          <Button onClick={handleSend} disabled={sending} size="sm">
            <Send className="mr-1 h-4 w-4" /> {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
