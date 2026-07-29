import { useEffect, useRef, useState } from "react";
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
import { useSendMessage } from "@/lib/api/queries";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTo?: string;
  defaultSubject?: string;
  defaultBody?: string;
  inReplyTo?: string;
  references?: string[];
}

interface Attachment {
  id: string;
  filename: string;
  size: number;
  contentType: string;
  content: string; // base64
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = reader.result as string;
      const idx = s.indexOf(",");
      resolve(idx >= 0 ? s.slice(idx + 1) : s);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function parseAddresses(input: string): string[] {
  return input
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatBytes(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

export function Composer({
  open,
  onOpenChange,
  defaultTo = "",
  defaultSubject = "",
  defaultBody = "",
  inReplyTo,
  references,
}: Props) {
  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [expanded, setExpanded] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const send = useSendMessage();

  // Re-seed when opened with new defaults (e.g. reply/forward).
  useEffect(() => {
    if (open) {
      setTo(defaultTo);
      setSubject(defaultSubject);
      setBody(defaultBody);
      setCc("");
      setShowCc(false);
      setAttachments([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultTo, defaultSubject]);

  function reset() {
    setTo("");
    setCc("");
    setSubject("");
    setBody("");
    setAttachments([]);
  }

  async function handleSend() {
    const recipients = parseAddresses(to);
    if (recipients.length === 0) {
      toast.error("Add at least one recipient");
      return;
    }
    if (!subject.trim()) {
      toast.error("Subject is required");
      return;
    }
    try {
      await send.mutateAsync({
        to: recipients,
        cc: cc ? parseAddresses(cc) : undefined,
        subject,
        text: body,
        inReplyTo,
        references,
        attachments: attachments.map(({ filename, content, contentType }) => ({
          filename,
          content,
          contentType,
        })),
      });
      toast.success("Message sent");
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error("Failed to send", { description: (err as Error).message });
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    const parsed: Attachment[] = [];
    for (const f of Array.from(files)) {
      if (f.size > 20 * 1024 * 1024) {
        toast.error(`${f.name} exceeds 20 MB`);
        continue;
      }
      try {
        const content = await fileToBase64(f);
        parsed.push({
          id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
          filename: f.name,
          size: f.size,
          contentType: f.type || "application/octet-stream",
          content,
        });
      } catch {
        toast.error(`Couldn't attach ${f.name}`);
      }
    }
    if (parsed.length) setAttachments((a) => [...a, ...parsed]);
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
          <DialogTitle className="text-sm font-semibold tracking-tight">
            {inReplyTo ? "Reply" : "New message"}
          </DialogTitle>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="icon-btn h-7 w-7"
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
            <button onClick={() => onOpenChange(false)} className="icon-btn h-7 w-7" aria-label="Close">
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
                <span className="font-medium">{a.filename}</span>
                <span className="text-muted-foreground">{formatBytes(a.size)}</span>
                <button
                  onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                  className="ml-1 rounded p-0.5 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-muted hover:text-destructive"
                  aria-label={`Remove ${a.filename}`}
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
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
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
          <Button onClick={handleSend} disabled={send.isPending} size="sm" className="gap-1.5">
            {send.isPending ? "Sending…" : "Send"}
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
