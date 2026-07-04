"use server";

import { requireOrgUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// The collaboration sidebar's server surface. Reads are RLS-scoped; writes go
// through the guarded RPCs. One counts call polls while closed; one panel call
// hydrates everything when open.

export type PulseCounts = { notifications: number; broadcasts: number; messages: number };

export async function pulseCounts(): Promise<PulseCounts> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("pulse_counts");
  const row = data?.[0];
  return {
    notifications: row?.notifications ?? 0,
    broadcasts: row?.broadcasts ?? 0,
    messages: row?.messages ?? 0,
  };
}

export type PulseNotification = {
  id: string; kind: string; title: string; body: string | null;
  href: string | null; at: string; read: boolean;
};
export type PulseBroadcast = {
  id: string; title: string; body: string; sender: string; mine: boolean;
  scope: string; at: string; acked: boolean; ackCount: number; audienceCount: number;
};
export type PulseConversation = {
  id: string; otherId: string; otherName: string; unread: number;
  lastBody: string | null; lastAt: string | null;
};
export type PulseContact = { id: string; name: string; department: string };

export async function pulsePanel(): Promise<{
  counts: PulseCounts;
  notifications: PulseNotification[];
  broadcasts: PulseBroadcast[];
  conversations: PulseConversation[];
  contacts: PulseContact[];
}> {
  const me = await requireOrgUser();
  const supabase = await createClient();

  const [countsRes, notifRes, bcRes, convoRes, usersRes, deptRes] = await Promise.all([
    supabase.rpc("pulse_counts"),
    supabase
      .from("notifications")
      .select("id, kind, title, body, href, created_at, read_at")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("broadcasts")
      .select("id, title, body, sender_id, department_id, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("conversations").select("id, user_a, user_b, created_at"),
    supabase.from("users").select("id, full_name, email, department_id, status, plane"),
    supabase.from("departments").select("id, name"),
  ]);

  const users = usersRes.data ?? [];
  const nameOf = (id: string | null) => {
    const u = users.find((x) => x.id === id);
    return u?.full_name ?? u?.email ?? "—";
  };
  const deptName = (id: string | null) =>
    deptRes.data?.find((d) => d.id === id)?.name ?? "—";

  // Broadcast enrichment: my ack + the sender tally.
  const bcIds = (bcRes.data ?? []).map((b) => b.id);
  const { data: acks } = bcIds.length
    ? await supabase.from("broadcast_acks").select("broadcast_id, user_id").in("broadcast_id", bcIds)
    : { data: [] as { broadcast_id: string; user_id: string }[] };
  const audienceCount = (b: { department_id: string | null; sender_id: string }) =>
    users.filter(
      (u) =>
        u.status === "active" &&
        u.plane === "org" &&
        u.id !== b.sender_id &&
        (b.department_id === null || u.department_id === b.department_id),
    ).length;

  // Conversation summaries: unread + last message per thread.
  const convoIds = (convoRes.data ?? []).map((c) => c.id);
  const { data: msgs } = convoIds.length
    ? await supabase
        .from("chat_messages")
        .select("conversation_id, sender_id, body, created_at, read_at")
        .in("conversation_id", convoIds)
        .order("created_at", { ascending: false })
    : { data: [] as { conversation_id: string; sender_id: string; body: string; created_at: string; read_at: string | null }[] };

  const counts = countsRes.data?.[0];
  return {
    counts: {
      notifications: counts?.notifications ?? 0,
      broadcasts: counts?.broadcasts ?? 0,
      messages: counts?.messages ?? 0,
    },
    notifications: (notifRes.data ?? []).map((n) => ({
      id: n.id, kind: n.kind, title: n.title, body: n.body, href: n.href,
      at: n.created_at, read: n.read_at !== null,
    })),
    broadcasts: (bcRes.data ?? []).map((b) => ({
      id: b.id,
      title: b.title,
      body: b.body,
      sender: nameOf(b.sender_id),
      mine: b.sender_id === me.id,
      scope: b.department_id === null ? "Entire company" : deptName(b.department_id),
      at: b.created_at,
      acked: (acks ?? []).some((a) => a.broadcast_id === b.id && a.user_id === me.id),
      ackCount: (acks ?? []).filter((a) => a.broadcast_id === b.id).length,
      audienceCount: audienceCount(b),
    })),
    conversations: (convoRes.data ?? [])
      .map((c) => {
        const otherId = c.user_a === me.id ? c.user_b : c.user_a;
        const mine = (msgs ?? []).filter((m) => m.conversation_id === c.id);
        return {
          id: c.id,
          otherId,
          otherName: nameOf(otherId),
          unread: mine.filter((m) => m.sender_id !== me.id && m.read_at === null).length,
          lastBody: mine[0]?.body ?? null,
          lastAt: mine[0]?.created_at ?? null,
        };
      })
      .sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? "")),
    contacts: users
      .filter((u) => u.id !== me.id && u.status === "active" && u.plane === "org")
      .map((u) => ({ id: u.id, name: u.full_name ?? u.email, department: deptName(u.department_id) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export type ChatMessage = {
  id: string; mine: boolean; body: string; at: string;
  doc: { id: string; number: string; title: string } | null;
};

export async function conversationThread(conversationId: string): Promise<ChatMessage[]> {
  const me = await requireOrgUser();
  const supabase = await createClient();
  const { data: msgs } = await supabase
    .from("chat_messages")
    .select("id, sender_id, body, document_id, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at")
    .limit(200);
  const docIds = [...new Set((msgs ?? []).map((m) => m.document_id).filter(Boolean))] as string[];
  const { data: docs } = docIds.length
    ? await supabase.from("documents").select("id, document_number, title").in("id", docIds)
    : { data: [] as { id: string; document_number: string | null; title: string }[] };
  await supabase.rpc("mark_conversation_read", { p_conversation: conversationId });
  return (msgs ?? []).map((m) => {
    const d = docs?.find((x) => x.id === m.document_id);
    return {
      id: m.id,
      mine: m.sender_id === me.id,
      body: m.body,
      at: m.created_at,
      doc: d ? { id: d.id, number: d.document_number ?? "—", title: d.title } : null,
    };
  });
}

type Result = { ok: true; message?: string } | { ok: false; error: string };
const rpc = async (fn: string, args: Record<string, unknown>): Promise<Result> => {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  return error ? { ok: false, error: error.message } : { ok: true };
};

export async function markNotificationRead(id: string): Promise<Result> {
  return rpc("mark_notification_read", { p_id: id });
}
export async function markAllNotificationsRead(): Promise<Result> {
  return rpc("mark_all_notifications_read", {});
}
export async function acknowledgeBroadcast(id: string): Promise<Result> {
  return rpc("acknowledge_broadcast", { p_broadcast: id });
}
export async function sendBroadcast(input: {
  title: string;
  body: string;
  departmentId: string | null;
}): Promise<Result> {
  return rpc("send_broadcast", {
    p_title: input.title,
    p_body: input.body,
    p_department: input.departmentId,
  });
}
export async function startConversation(userId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_conversation", { p_user: userId });
  return error ? { ok: false, error: error.message } : { ok: true, id: String(data) };
}
export async function sendChatMessage(input: {
  conversationId: string;
  body: string;
  documentId: string | null;
}): Promise<Result> {
  return rpc("send_chat_message", {
    p_conversation: input.conversationId,
    p_body: input.body,
    p_document: input.documentId,
  });
}
export async function setSoundPref(on: boolean): Promise<Result> {
  return rpc("set_sound_pref", { p_on: on });
}
