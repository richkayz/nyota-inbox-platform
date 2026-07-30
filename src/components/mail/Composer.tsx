import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Quote,
  Eraser,
  Trash2,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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

const DRAFT_KEY = "nyota.compose.draft";
export const SIGNATURE_KEY = "nyota.settings.signature";

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

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
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

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function htmlToPlain(html: string) {
  const el = document.createElement("div");
  el.innerHTML = html;
  el.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  el.querySelectorAll("p, div, li").forEach((n) => n.append("\n"));
  return (el.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

function readSignature(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(SIGNATURE_KEY) ?? "";
}

function signatureHtml() {
  const sig = readSignature().trim();
  if (!sig) return "";
  return `<br><br><div class="nyota-signature">${escapeHtml(sig).replace(/\n/g, "<br>")}</div>`;
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
  const [bcc, setBcc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState(defaultSubject);
  const [expanded, setExpanded] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const send = useSendMessage();

  const setEditorHtml = useCallback((html: string) => {
    if (editorRef.current) editorRef.current.innerHTML = html;
  }, []);

  // Seed on open: restore draft for a fresh compose, otherwise use reply defaults.
  useEffect(() => {
    if (!open) return;
    const isReply = Boolean(inReplyTo) || Boolean(defaultTo) || Boolean(defaultSubject);
    let seeded = false;
    if (!isReply) {
      try {
        const raw = window.localStorage.getItem(DRAFT_KEY);
        if (raw) {
          const d = JSON.parse(raw) as {
            to?: string; cc?: string; bcc?: string; subject?: string; html?: string;
          };
          setTo(d.to ?? "");
          setCc(d.cc ?? "");
          setBcc(d.bcc ?? "");
          setShowCc(Boolean(d.cc));
          setShowBcc(Boolean(d.bcc));
          setSubject(d.subject ?? "");
          requestAnimationFrame(() => setEditorHtml(d.html ?? signatureHtml()));
          seeded = true;
        }
      } catch {
        /* ignore malformed drafts */
      }
    }
    if (!seeded) {
      setTo(defaultTo);
      setSubject(defaultSubject);
      setCc("");
      setBcc("");
      setShowCc(false);
      setShowBcc(false);
      const body = defaultBody ? `${escapeHtml(defaultBody).replace(/\n/g, "<br>")}` : "";
      requestAnimationFrame(() => setEditorHtml(body + signatureHtml()));
    }
    setAttachments([]);
    setSavedAt(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultTo, defaultSubject, defaultBody, inReplyTo]);

  // Draft autosave (every 2s while open).
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => {
      const html = editorRef.current?.innerHTML ?? "";
      const hasContent = to || cc || bcc || subject || htmlToPlain(html);
      if (!hasContent) return;
      window.localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ to, cc, bcc, subject, html, savedAt: Date.now() }),
      );
      setSavedAt(new Date());
    }, 2000);
    return () => window.clearInterval(timer);
  }, [open, to, cc, bcc, subject]);

  function clearDraft() {
    window.localStorage.removeItem(DRAFT_KEY);
    setSavedAt(null);
  }

  function reset() {
    setTo("");
    setCc("");
    setBcc("");
    setSubject("");
    setEditorHtml("");
    setAttachments([]);
    clearDraft();
  }

  function exec(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
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
    const html = editorRef.current?.innerHTML ?? "";
    try {
      await send.mutateAsync({
        to: recipients,
        cc: cc ? parseAddresses(cc) : undefined,
        bcc: bcc ? parseAddresses(bcc) : undefined,
        subject,
        html,
        text: htmlToPlain(html),
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

  async function handleFiles(files: FileList | File[] | null) {
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

  async function insertImages(files: FileList | File[] | null) {
    if (!files) return;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > 5 * 1024 * 1024) {
        toast.error(`${f.name} is too large to inline (5 MB max)`);
        continue;
      }
      const url = await fileToDataUrl(f);
      exec("insertHTML", `<img src="${url}" alt="${escapeHtml(f.name)}" />`);
    }
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length === 0) return;
    const images = files.filter((f) => f.type.startsWith("image/"));
    const rest = files.filter((f) => !f.type.startsWith("image/"));
    if (images.length) await insertImages(images);
    if (rest.length) await handleFiles(rest);
  }

  const toolbar = useMemo(
    () => [
      { icon: Bold, label: "Bold", run: () => exec("bold") },
      { icon: Italic, label: "Italic", run: () => exec("italic") },
      { icon: Underline, label: "Underline", run: () => exec("underline") },
      { icon: List, label: "Bulleted list", run: () => exec("insertUnorderedList") },
      { icon: ListOrdered, label: "Numbered list", run: () => exec("insertOrderedList") },
      { icon: Quote, label: "Quote", run: () => exec("formatBlock", "blockquote") },
      {
        icon: Link2,
        label: "Link",
        run: () => {
          const url = window.prompt("Link URL");
          if (url) exec("createLink", url);
        },
      },
      { icon: ImageIcon, label: "Inline image", run: () => imageInputRef.current?.click() },
      { icon: Eraser, label: "Clear formatting", run: () => exec("removeFormat") },
    ],
    [],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "gap-0 overflow-hidden p-0 transition-[max-width]",
          expanded ? "max-w-5xl" : "max-w-3xl",
        )}
      >
        <DialogHeader className="flex flex-row items-center justify-between border-b border-border bg-muted/40 px-5 py-3">
          <DialogTitle className="text-sm font-semibold tracking-tight">
            {inReplyTo ? "Reply" : "New message"}
          </DialogTitle>
          <div className="flex items-center gap-1">
            {savedAt && (
              <span className="mr-2 text-[11px] text-muted-foreground">
                Draft saved {savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </span>
            )}
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
            <div className="flex shrink-0 gap-2 text-xs font-medium text-muted-foreground">
              {!showCc && (
                <button onClick={() => setShowCc(true)} className="transition hover:text-foreground">
                  Cc
                </button>
              )}
              {!showBcc && (
                <button onClick={() => setShowBcc(true)} className="transition hover:text-foreground">
                  Bcc
                </button>
              )}
            </div>
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
          {showBcc && (
            <div className="flex items-center gap-3 px-5">
              <label className="w-14 shrink-0 text-xs font-medium text-muted-foreground">Bcc</label>
              <Input
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                placeholder="bcc@company.com"
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

        <div
          className={cn("relative", dragging && "ring-2 ring-inset ring-primary")}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <div
            ref={editorRef}
            contentEditable
            role="textbox"
            aria-multiline="true"
            aria-label="Message body"
            data-placeholder="Write your message…"
            className={cn(
              "compose-editor overflow-y-auto px-5 py-4 text-sm leading-relaxed outline-none",
              expanded ? "min-h-[440px] max-h-[55vh]" : "min-h-[260px] max-h-[40vh]",
            )}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files ?? []);
              if (files.some((f) => f.type.startsWith("image/"))) {
                e.preventDefault();
                insertImages(files);
              }
            }}
          />
          {dragging && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-primary/5 text-sm font-medium text-primary">
              Drop files to attach
            </div>
          )}
        </div>

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
          <div className="flex flex-wrap items-center gap-0.5">
            {toolbar.map(({ icon: Icon, label, run }) => (
              <button
                key={label}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={run}
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
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                insertImages(e.target.files);
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
              onClick={() => {
                const sig = signatureHtml();
                if (!sig) {
                  toast("Add a signature in Settings → Signature");
                  return;
                }
                exec("insertHTML", sig);
              }}
              className="icon-btn h-8 w-8"
              aria-label="Insert signature"
              title="Insert signature"
            >
              <FileText className="h-3.5 w-3.5" />
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
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                reset();
                toast("Draft discarded");
                onOpenChange(false);
              }}
              className="icon-btn h-8 w-8 hover:text-destructive"
              aria-label="Discard draft"
              title="Discard draft"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <Button onClick={handleSend} disabled={send.isPending} size="sm" className="gap-1.5">
              {send.isPending ? "Sending…" : "Send"}
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
