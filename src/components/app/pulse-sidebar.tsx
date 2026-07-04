"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Activity,
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronRight,
  FileText,
  Loader2,
  Megaphone,
  MessageSquare,
  Paperclip,
  Send,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  pulseCounts, pulsePanel, conversationThread,
  markNotificationRead, markAllNotificationsRead,
  acknowledgeBroadcast, sendBroadcast, startConversation, sendChatMessage,
  type PulseCounts, type PulseNotification, type PulseBroadcast,
  type PulseConversation, type PulseContact, type ChatMessage,
} from "@/app/(org)/pulse/actions";
import { searchDocuments, type DocHit } from "@/lib/document-search";
import { playPulseSound, playBroadcastSound, playMessageSound } from "@/lib/pulse-sounds";

// THE PULSE — the app's heartbeat, one right sidebar with a handle. Pulse
// (default tab) carries everything needing attention; Broadcasts carry
// acknowledgeable announcements; Messages is 1:1 chat with SOP tagging. The
// closed handle badges the COMBINED unread count. Polling: ~20s closed
// (counts only), ~8s open (full panel). Each category has its own hardcoded
// sound, gated by the user's sound preference.
export function PulseSidebar({
  modules,
  soundEnabled,
  canBroadcast,
  departments,
  myDepartmentId,
  isQaOrAdmin,
}: {
  modules: { pulse: boolean; broadcasts: boolean; messages: boolean };
  soundEnabled: boolean;
  canBroadcast: boolean;
  departments: { id: string; name: string }[];
  myDepartmentId: string | null;
  isQaOrAdmin: boolean;
}) {
  const enabledTabs = [
    modules.pulse && "pulse",
    modules.messages && "messages",
    modules.broadcasts && "broadcasts",
  ].filter(Boolean) as string[];

  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState(enabledTabs[0] ?? "pulse");
  const [counts, setCounts] = React.useState<PulseCounts>({ notifications: 0, broadcasts: 0, messages: 0 });
  const [panel, setPanel] = React.useState<Awaited<ReturnType<typeof pulsePanel>> | null>(null);
  const [thread, setThread] = React.useState<{ convo: PulseConversation; messages: ChatMessage[] } | null>(null);
  const prev = React.useRef<PulseCounts | null>(null);
  const openRef = React.useRef(open);
  openRef.current = open;

  const total = counts.notifications + counts.broadcasts + counts.messages;

  const refresh = React.useCallback(async () => {
    if (openRef.current) {
      const p = await pulsePanel();
      setPanel(p);
      handleSounds(p.counts);
      setCounts(p.counts);
    } else {
      const c = await pulseCounts();
      handleSounds(c);
      setCounts(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSounds(next: PulseCounts) {
    const last = prev.current;
    prev.current = next;
    if (!last || !soundEnabled) return;
    if (next.notifications > last.notifications) playPulseSound();
    if (next.broadcasts > last.broadcasts) playBroadcastSound();
    if (next.messages > last.messages) playMessageSound();
  }

  React.useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), open ? 8000 : 20000);
    return () => clearInterval(t);
  }, [open, refresh]);

  if (enabledTabs.length === 0) return null;

  return (
    <>
      {/* The handle — always visible on the right edge */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close the pulse" : `Open the pulse${total ? ` (${total} unread)` : ""}`}
        className="fixed right-0 top-1/3 z-50 flex flex-col items-center gap-1 rounded-l-lg border border-r-0 bg-background px-1.5 py-3 shadow-md transition-transform hover:-translate-x-0.5"
      >
        <Activity className="size-4 text-primary" />
        {total > 0 && (
          <Badge className="h-5 min-w-5 justify-center px-1 text-[10px]">{total > 99 ? "99+" : total}</Badge>
        )}
      </button>

      {/* The panel */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l bg-background shadow-xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!open}
      >
        <header className="flex items-center gap-2 border-b px-4 py-2.5">
          <Activity className="size-4 text-primary" />
          <span className="font-semibold">Pulse</span>
          <Button variant="ghost" size="icon" className="ml-auto" onClick={() => setOpen(false)} aria-label="Close">
            <X className="size-4" />
          </Button>
        </header>

        <Tabs value={tab} onValueChange={(v) => { setTab(v); setThread(null); }} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-3 mt-2 grid" style={{ gridTemplateColumns: `repeat(${enabledTabs.length}, 1fr)` }}>
            {modules.pulse && (
              <TabsTrigger value="pulse">
                Pulse{counts.notifications > 0 && <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">{counts.notifications}</Badge>}
              </TabsTrigger>
            )}
            {modules.messages && (
              <TabsTrigger value="messages">
                Messages{counts.messages > 0 && <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">{counts.messages}</Badge>}
              </TabsTrigger>
            )}
            {modules.broadcasts && (
              <TabsTrigger value="broadcasts">
                Broadcast{counts.broadcasts > 0 && <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">{counts.broadcasts}</Badge>}
              </TabsTrigger>
            )}
          </TabsList>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {!panel ? (
              <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </p>
            ) : tab === "pulse" ? (
              <PulseFeed
                items={panel.notifications}
                unreadMessages={counts.messages}
                onOpenMessages={() => setTab("messages")}
                onChanged={refresh}
                onNavigate={() => setOpen(false)}
              />
            ) : tab === "messages" ? (
              thread ? (
                <ThreadView
                  convo={thread.convo}
                  messages={thread.messages}
                  onBack={() => { setThread(null); void refresh(); }}
                  onSent={async () => {
                    const messages = await conversationThread(thread.convo.id);
                    setThread((t) => (t ? { ...t, messages } : t));
                  }}
                />
              ) : (
                <ConversationList
                  conversations={panel.conversations}
                  contacts={panel.contacts}
                  onOpen={async (convo) => {
                    const messages = await conversationThread(convo.id);
                    setThread({ convo, messages });
                    void refresh();
                  }}
                />
              )
            ) : (
              <BroadcastFeed
                items={panel.broadcasts}
                canBroadcast={canBroadcast}
                departments={departments}
                myDepartmentId={myDepartmentId}
                isQaOrAdmin={isQaOrAdmin}
                onChanged={refresh}
              />
            )}
          </div>
        </Tabs>
      </aside>
    </>
  );
}

// ---- Pulse feed ----
const KIND_LABEL: Record<string, string> = {
  endorsement: "Endorsement", qa_review: "QA review", changes_requested: "Changes requested",
  effective: "Effective", training: "Training", copy_request: "Copies", copy_decision: "Copies",
  access_request: "Access", access_decision: "Access",
};

function PulseFeed({
  items, unreadMessages, onOpenMessages, onChanged, onNavigate,
}: {
  items: PulseNotification[];
  unreadMessages: number;
  onOpenMessages: () => void;
  onChanged: () => void;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const unread = items.filter((i) => !i.read).length;
  return (
    <div className="space-y-2">
      {unreadMessages > 0 && (
        <button
          type="button"
          onClick={onOpenMessages}
          className="flex w-full items-center gap-2 rounded-md border bg-primary/5 p-2.5 text-left text-sm hover:bg-primary/10"
        >
          <MessageSquare className="size-4 text-primary" />
          {unreadMessages} unread {unreadMessages === 1 ? "message" : "messages"}
          <ChevronRight className="ml-auto size-4 text-muted-foreground" />
        </button>
      )}
      {unread > 0 && (
        <div className="flex justify-end">
          <Button
            variant="ghost" size="sm"
            onClick={async () => { await markAllNotificationsRead(); onChanged(); }}
          >
            <CheckCheck className="size-3.5" /> Mark all read
          </Button>
        </div>
      )}
      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          All quiet — anything needing your attention will show up here.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={async () => {
                  if (!n.read) void markNotificationRead(n.id);
                  onChanged();
                  if (n.href) { onNavigate(); router.push(n.href); }
                }}
                className={`w-full rounded-md border p-2.5 text-left transition-colors hover:bg-muted/50 ${
                  n.read ? "opacity-70" : "border-primary/30 bg-primary/5"
                }`}
              >
                <span className="flex items-center gap-2">
                  {!n.read && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                  <span className="text-sm font-medium">{n.title}</span>
                  <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
                    {KIND_LABEL[n.kind] ?? n.kind}
                  </Badge>
                </span>
                {n.body && <span className="mt-0.5 block text-xs text-muted-foreground">{n.body}</span>}
                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                  {new Date(n.at).toLocaleString()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- Broadcasts ----
function BroadcastFeed({
  items, canBroadcast, departments, myDepartmentId, isQaOrAdmin, onChanged,
}: {
  items: PulseBroadcast[];
  canBroadcast: boolean;
  departments: { id: string; name: string }[];
  myDepartmentId: string | null;
  isQaOrAdmin: boolean;
  onChanged: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  return (
    <div className="space-y-3">
      {canBroadcast && (
        <ComposeBroadcast
          departments={departments}
          myDepartmentId={myDepartmentId}
          isQaOrAdmin={isQaOrAdmin}
          onSent={onChanged}
        />
      )}
      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No announcements yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((b) => (
            <li key={b.id} className={`rounded-md border p-3 ${!b.acked && !b.mine ? "border-primary/30 bg-primary/5" : ""}`}>
              <div className="flex items-start gap-2">
                <Megaphone className="mt-0.5 size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{b.title}</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm">{b.body}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {b.sender} · {b.scope} · {new Date(b.at).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-end gap-2">
                {b.mine ? (
                  <Badge variant="secondary">
                    {b.ackCount}/{b.audienceCount} acknowledged
                  </Badge>
                ) : b.acked ? (
                  <span className="flex items-center gap-1 text-xs text-[var(--status-effective,#16a34a)]">
                    <Check className="size-3.5" /> Acknowledged
                  </span>
                ) : (
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const res = await acknowledgeBroadcast(b.id);
                        if (res.ok) onChanged();
                        else toast.error(res.error);
                      })
                    }
                  >
                    <Check /> Acknowledge
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ComposeBroadcast({
  departments, myDepartmentId, isQaOrAdmin, onSent,
}: {
  departments: { id: string; name: string }[];
  myDepartmentId: string | null;
  isQaOrAdmin: boolean;
  onSent: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [scope, setScope] = React.useState<string>(isQaOrAdmin ? "company" : (myDepartmentId ?? ""));
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <Megaphone /> New announcement
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Broadcast an announcement</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="bc-scope">Send to</Label>
            <select
              id="bc-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {isQaOrAdmin && <option value="company">Entire company</option>}
              {(isQaOrAdmin ? departments : departments.filter((d) => d.id === myDepartmentId)).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} department
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bc-title">Title</Label>
            <Input id="bc-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bc-body">Message</Label>
            <Textarea id="bc-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={pending || !title.trim() || !body.trim() || !scope}
            onClick={() =>
              startTransition(async () => {
                const res = await sendBroadcast({
                  title: title.trim(),
                  body: body.trim(),
                  departmentId: scope === "company" ? null : scope,
                });
                if (res.ok) {
                  toast.success("Announcement sent.");
                  setOpen(false); setTitle(""); setBody("");
                  onSent();
                } else toast.error(res.error);
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <Send />} Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Messages ----
function ConversationList({
  conversations, contacts, onOpen,
}: {
  conversations: PulseConversation[];
  contacts: PulseContact[];
  onOpen: (c: PulseConversation) => void;
}) {
  const [q, setQ] = React.useState("");
  const started = new Set(conversations.map((c) => c.otherId));
  const filteredContacts = contacts.filter(
    (c) => !started.has(c.id) && c.name.toLowerCase().includes(q.toLowerCase()),
  );
  const [pending, startTransition] = React.useTransition();

  return (
    <div className="space-y-3">
      {conversations.length > 0 && (
        <ul className="space-y-1.5">
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onOpen(c)}
                className="flex w-full items-center gap-2 rounded-md border p-2.5 text-left hover:bg-muted/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{c.otherName}</span>
                  {c.lastBody && (
                    <span className="block truncate text-xs text-muted-foreground">{c.lastBody}</span>
                  )}
                </span>
                {c.unread > 0 && (
                  <Badge className="h-5 min-w-5 justify-center px-1 text-[10px]">{c.unread}</Badge>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Start a chat</p>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a colleague…" className="h-8" />
        <ul className="max-h-56 space-y-1 overflow-y-auto">
          {filteredContacts.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await startConversation(c.id);
                    if (res.ok)
                      onOpen({ id: res.id, otherId: c.id, otherName: c.name, unread: 0, lastBody: null, lastAt: null });
                    else toast.error(res.error);
                  })
                }
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/50"
              >
                {c.name}
                <span className="text-xs text-muted-foreground">{c.department}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ThreadView({
  convo, messages, onBack, onSent,
}: {
  convo: PulseConversation;
  messages: ChatMessage[];
  onBack: () => void;
  onSent: () => Promise<void>;
}) {
  const [body, setBody] = React.useState("");
  const [taggedDoc, setTaggedDoc] = React.useState<DocHit | null>(null);
  const [pending, startTransition] = React.useTransition();
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const router = useRouter();

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  function send() {
    if (!body.trim() && !taggedDoc) return;
    startTransition(async () => {
      const res = await sendChatMessage({
        conversationId: convo.id,
        body: body.trim(),
        documentId: taggedDoc?.id ?? null,
      });
      if (res.ok) {
        setBody(""); setTaggedDoc(null);
        await onSent();
      } else toast.error(res.error);
    });
  }

  return (
    <div className="flex h-full min-h-[60vh] flex-col">
      <div className="mb-2 flex items-center gap-2 border-b pb-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to conversations">
          <ArrowLeft className="size-4" />
        </Button>
        <span className="text-sm font-semibold">{convo.otherName}</span>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                m.mine ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}
            >
              {m.body && <p className="whitespace-pre-wrap">{m.body}</p>}
              {m.doc && (
                <button
                  type="button"
                  onClick={() => router.push(`/documents/${m.doc!.id}`)}
                  className={`mt-1 flex items-center gap-1.5 rounded border px-2 py-1 text-xs ${
                    m.mine ? "border-primary-foreground/40" : "border-border bg-background"
                  }`}
                >
                  <FileText className="size-3.5" />
                  <span className="font-mono">{m.doc.number}</span>
                  <span className="truncate">{m.doc.title}</span>
                </button>
              )}
              <p className={`mt-0.5 text-[10px] ${m.mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                {new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="mt-2 space-y-1.5 border-t pt-2">
        {taggedDoc && (
          <span className="flex items-center gap-1.5 rounded border bg-muted/50 px-2 py-1 text-xs">
            <FileText className="size-3.5" />
            <span className="font-mono">{taggedDoc.number}</span>
            <span className="truncate">{taggedDoc.title}</span>
            <button type="button" className="ml-auto" onClick={() => setTaggedDoc(null)} aria-label="Remove tag">
              <X className="size-3.5" />
            </button>
          </span>
        )}
        <div className="flex items-end gap-1.5">
          <TagSopButton onPick={setTaggedDoc} />
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Message…"
            className="min-h-9 flex-1 resize-none"
          />
          <Button size="icon" onClick={send} disabled={pending || (!body.trim() && !taggedDoc)} aria-label="Send">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TagSopButton({ onPick }: { onPick: (d: DocHit) => void }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<DocHit[]>([]);

  React.useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(async () => setHits(await searchDocuments(q)), 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Tag an SOP">
          <Paperclip className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tag an SOP</DialogTitle>
        </DialogHeader>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number or title…" autoFocus />
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {hits.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => { onPick(d); setOpen(false); setQ(""); }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/50"
              >
                <span className="font-mono text-xs text-muted-foreground">{d.number}</span>
                <span className="truncate">{d.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
