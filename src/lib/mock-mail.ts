// Mock IMAP data — replaced by real Mail Gateway calls once the backend is wired.

export interface MailFolder {
  id: string;
  name: string;
  count: number;
  unread: number;
}

export interface MailMessage {
  id: string;
  folderId: string;
  from: { name: string; email: string };
  to: string[];
  subject: string;
  preview: string;
  body: string;
  date: string; // ISO
  unread: boolean;
  starred: boolean;
  hasAttachment: boolean;
}

export const FOLDERS: MailFolder[] = [
  { id: "inbox", name: "Inbox", count: 24, unread: 6 },
  { id: "starred", name: "Starred", count: 8, unread: 0 },
  { id: "sent", name: "Sent", count: 142, unread: 0 },
  { id: "drafts", name: "Drafts", count: 3, unread: 0 },
  { id: "spam", name: "Spam", count: 12, unread: 2 },
  { id: "trash", name: "Trash", count: 34, unread: 0 },
];

const SENDERS = [
  { name: "Amara Okafor", email: "amara@nyota.one" },
  { name: "David Chen", email: "d.chen@partner.com" },
  { name: "Priya Sharma", email: "priya@design.studio" },
  { name: "Lucas Meyer", email: "lucas@finance.co" },
  { name: "Sofia Ricci", email: "s.ricci@legal.eu" },
  { name: "Kwame Boateng", email: "kwame@ops.africa" },
  { name: "Naomi Tanaka", email: "naomi@growth.jp" },
];

const SUBJECTS = [
  "Q4 pipeline review — action items",
  "Contract v3 attached for signature",
  "Design system rollout: phase 2",
  "Re: Server migration window",
  "Payroll approval needed by Friday",
  "Welcome to the team 🎉",
  "Weekly ops digest — week 47",
  "Board deck draft — please review",
  "Vendor renewal: 45 days out",
  "Support ticket #4821 escalated",
];

const PREVIEWS = [
  "Following up on our conversation earlier. I've drafted a plan that covers…",
  "Attached is the revised contract with the changes we agreed. Please sign…",
  "The rollout for the next set of teams begins Monday. Below is the checklist…",
  "Confirming the maintenance window is scheduled for Saturday 02:00 UTC…",
  "Please approve the November payroll batch before end of day Friday…",
  "So glad to have you on board — here's everything you need for day one…",
];

export const MESSAGES: MailMessage[] = Array.from({ length: 24 }, (_, i) => {
  const sender = SENDERS[i % SENDERS.length];
  const daysAgo = i * 0.3;
  return {
    id: `m${i + 1}`,
    folderId: "inbox",
    from: sender,
    to: ["you@nyota.one"],
    subject: SUBJECTS[i % SUBJECTS.length],
    preview: PREVIEWS[i % PREVIEWS.length],
    body: `${PREVIEWS[i % PREVIEWS.length]}\n\nLet me know your thoughts when you get a chance.\n\nBest,\n${sender.name}`,
    date: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    unread: i < 6,
    starred: i % 5 === 0,
    hasAttachment: i % 3 === 0,
  };
});

export function formatMailDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
