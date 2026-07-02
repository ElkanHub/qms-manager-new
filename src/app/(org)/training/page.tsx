import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/app/_components/ActionForm";
import { assignTraining, completeTraining } from "@/app/(org)/oversight/actions";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/section-card";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GraduationCap } from "lucide-react";

// D-TRAINING — assign training on effective documents, record completion, and show
// per-document threshold status. Stragglers (still 'assigned') are flagged; the core
// blocks release until the threshold is met (enforced server-side).
export default async function Training() {
  const user = await requireOrgUser();
  const roles = await getMyRoles();
  // Manage tab visibility mirrors the original screen (qa OR trainer); the RPC
  // still enforces authority server-side.
  const isQa = roles.includes("qa") || roles.includes("trainer");
  const supabase = await createClient();

  const { data: docs } = await supabase
    .from("documents")
    .select("id, title, document_number")
    .eq("status", "active")
    .order("document_number");
  const { data: users } = await supabase.from("users").select("id, email, full_name").order("email");
  const { data: assignments } = await supabase
    .from("training_assignments")
    .select("id, document_id, user_id, status, completed_at")
    .order("assigned_at", { ascending: false });

  const docLabel = (id: string) => {
    const d = docs?.find((x) => x.id === id);
    return d ? `${d.document_number ?? "—"} · ${d.title}` : id;
  };
  const userLabel = (id: string) => {
    const u = users?.find((x) => x.id === id);
    return u ? (u.full_name ?? u.email) : id;
  };

  const mine = (assignments ?? []).filter((a) => a.user_id === user.id);

  // per-document completed/total (+ stragglers still 'assigned')
  const stats = new Map<string, { done: number; total: number; stragglers: string[] }>();
  for (const a of assignments ?? []) {
    const s = stats.get(a.document_id) ?? { done: 0, total: 0, stragglers: [] };
    s.total += 1;
    if (a.status === "completed") s.done += 1;
    else s.stragglers.push(a.user_id);
    stats.set(a.document_id, s);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <PageHeader
        title="Training"
        description="Your assignments and, for QA, training oversight."
      />

      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">My training</TabsTrigger>
          {isQa && <TabsTrigger value="manage">Manage</TabsTrigger>}
        </TabsList>

        <TabsContent value="mine" className="space-y-3">
          {mine.length === 0 ? (
            <EmptyState icon={GraduationCap} message="No training assigned to you right now." />
          ) : (
            mine.map((a) => (
              <SectionCard key={a.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-medium">{docLabel(a.document_id)}</span>
                  <div className="flex items-center gap-3">
                    <StatusBadge value={a.status} kind="training" />
                    {a.status === "assigned" && (
                      <ActionForm action={completeTraining} submitLabel="Mark complete">
                        <input type="hidden" name="assignment_id" value={a.id} />
                      </ActionForm>
                    )}
                  </div>
                </div>
              </SectionCard>
            ))
          )}
        </TabsContent>

        {isQa && (
          <TabsContent value="manage" className="space-y-6">
            <SectionCard title="Assign training" description="Assign an effective document to a user.">
              <ActionForm action={assignTraining} submitLabel="Assign">
                <div className="space-y-1.5">
                  <Label htmlFor="document_id">Document</Label>
                  <Select name="document_id" required>
                    <SelectTrigger id="document_id">
                      <SelectValue placeholder="Select a document…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(docs ?? []).map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {docLabel(d.id)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="user_id">User</Label>
                  <Select name="user_id" required>
                    <SelectTrigger id="user_id">
                      <SelectValue placeholder="Select a user…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(users ?? []).map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {userLabel(u.id)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </ActionForm>
            </SectionCard>

            <SectionCard title="Threshold status" description="Completion per document; stragglers still owe training.">
              {stats.size === 0 ? (
                <EmptyState icon={GraduationCap} message="No training has been assigned yet." />
              ) : (
                <div className="space-y-5">
                  {[...stats.entries()].map(([docId, s]) => (
                    <div key={docId} className="space-y-2">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium">{docLabel(docId)}</span>
                        <span className="text-muted-foreground">
                          {s.done}/{s.total} trained
                        </span>
                      </div>
                      <Progress value={s.total ? (s.done / s.total) * 100 : 0} />
                      {s.stragglers.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Stragglers: {s.stragglers.map(userLabel).join(", ")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
