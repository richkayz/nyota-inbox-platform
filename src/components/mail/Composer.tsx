import { useState } from "react";
import {
  Paperclip,
  Send,
  X,
  Sparkles,
  Bold,
  Italic,
  Underline,
  Link2,
  List,
  ListOrdered,
  Image as ImageIcon,
  Minimize2,
  Maximize2,
  FileText,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTo?: string;
  defaultSubject?: string;
  defaultBody?: string;
}

interface Attachment {
  id: string;
  name: string;
  size: string;
}

export function Composer({ open, onOpenChange, defaultTo = "", defaultSubject = "", defaultBody = "" }: Props) {
  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  async function handleSend() {
    if (!to || !subject) {
      toast.error("Recipient and subject are required");
      return;
    }
    setSending(true);
    await new Promise((r) => setTimeout(r, 600));
    setSending(false);
    onOpenChange(false);
    toast.success("Message queued for delivery");
    setTo("");
    setCc("");
    setSubject("");
    setBody("");
    setAttachments([]);
  }

  function mockAttach() {
    const id = crypto.randomUUID();
    setAttachments((a) => [...a, { id, name: `document-${a.length + 1}.pdf`, size: "128 KB" }]);
  }

  const formatButtons = [
    { icon: Bold, label: "Bold" },
    { icon: Italic, label: "Italic" },
    { icon: Underline, label: "Underline" },
    { icon: Link2, label: "Link" },
    { icon: List, label: "Bulleted list" },
    { icon: ListOrdered, label: "Numbered list" },
    { icon: ImageIcon, label: "Insert image" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "gap-0 overflow-hidden p-0 transition-[max-width]",
          expanded ? "max-w-4xl" : "max-w-2xl",
        )}
      >
        <DialogHeader className="flex flex-row items-center justify-between border-b border-border bg-muted/40 px-5 py-3">
          <DialogTitle className="text-sm font-semibold tracking-tight">New message</DialogTitle>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="icon-btn h-7 w-7"
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => onOpenChange(false)}
              className="icon-btn h-7 w-7"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </DialogHeader>

        <div className="divide-y divide-border">
          <div className="flex items-center gap-3 px-5">
            <label className="w-14 shrink-0 text-xs font-medium text-muted-foreground">To</label>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="name@company.com"
              className="border-0 px-0 shadow-none focus-visible:ring-0"
            />
            {!showCc && (
              <button
                onClick={() => setShowCc(true)}
                className="shrink-0 text-xs font-medium text-muted-foreground transition hover:text-foreground"
              >
                Cc
              </button>
            )}
          </div>
          {showCc && (
            <div className="flex items-center gap-3 px-5">
              <label className="w-14 shrink-0 text-xs font-medium text-muted-foreground">Cc</label>
              <Input
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="cc@company.com"
                className="border-0 px-0 shadow-none focus-visible:ring-0"
              />
            </div>
          )}
          <div className="flex items-center gap-3 px-5">
            <label className="w-14 shrink-0 text-xs font-medium text-muted-foreground">Subject</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What is this about?"
              className="border-0 px-0 font-medium shadow-none focus-visible:ring-0"
            />
          </div>
        </div>

        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your message…"
          className={cn(
            "resize-none rounded-none border-0 px-5 py-4 text-sm leading-relaxed shadow-none focus-visible:ring-0",
            expanded ? "min-h-[420px]" : "min-h-[240px]",
          )}
        />

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-border px-5 py-3">
            {attachments.map((a) => (
              <div
                key={a.id}
                className="group flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs shadow-xs"
              >
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium">{a.name}</span>
                <span className="text-muted-foreground">{a.size}</span>
                <button
                  onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                  className="ml-1 rounded p-0.5 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-muted hover:text-destructive"
                  aria-label={`Remove ${a.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/40 px-3 py-2">
          <div className="flex items-center gap-0.5">
            {formatButtons.map(({ icon: Icon, label }) => (
              <button
                key={label}
                onClick={() => toast(`${label} — formatting pending`)}
                className="icon-btn h-8 w-8"
                aria-label={label}
                title={label}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
            <div className="mx-1 h-5 w-px bg-border" />
            <button
              onClick={mockAttach}
              className="icon-btn h-8 w-8"
              aria-label="Attach file"
              title="Attach file"
            >
              <Paperclip className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => toast("AI compose — module pending")}
              className="icon-btn h-8 w-8"
              aria-label="AI compose"
              title="AI compose"
            >
              <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
            </button>
          </div>
          <Button onClick={handleSend} disabled={sending} size="sm" className="gap-1.5">
            {sending ? "Sending…" : "Send"}
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
