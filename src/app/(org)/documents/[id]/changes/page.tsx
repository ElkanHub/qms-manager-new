import Link from "next/link";
import { GitPullRequest } from "lucide-react";
import { requireOrgUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { ActionForm } from "@/app/_components/ActionForm";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/components/app/section-card";
import { updateDraft, resubmitDocument } from "../../actions";

// D-CHANGES — the change controls touching this document, plus (when a review has
// asked for changes) the author's revise/resubmit response. Prior versions preserved.
export default async function ChangesResponse({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireOrgUser();
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("id, document_number, title, status")
    .eq("id", id)
    .maybeSingle();

  // Change controls touching this document (via the join table, RLS-scoped).
  const { data: ccLinks } = await supabase
    .from("change_control_documents")
    .select("change_control:change_controls(id, type, status, created_at)")
    .eq("document_id", id);
  const ccs = (ccLinks ?? [])
    .map((l) => l.change_control)
    .flat()
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));

  const { data: request } = await supabase
    .from("approval_requests")
    .select("id, stage, reason")
    .eq("document_id", id)
    .eq("status", "changes_requested")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: version } = await supabase
    .from("document_versions")
    .select("content_ref, reason_for_change")
    .eq("document_id", id)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!doc) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-2">
        <PageHeader title="Not available" />
        <Alert>
          <AlertDescription>
            Document not found.{" "}
            <Link href="/library" className="font-medium underline underline-offset-4">
              Back to library
            </Link>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-2">
      <PageHeader
        overline={doc.document_number ?? "—"}
        status={doc.status ?? "active"}
        title={doc.title ?? "Untitled"}
      />

      <Tabs defaultValue="changes">
        <TabsList>
          <TabsTrigger value="document" asChild>
            <Link href={`/documents/${id}`}>Document</Link>
          </TabsTrigger>
          <TabsTrigger value="history" asChild>
            <Link href={`/documents/${id}/history`}>History</Link>
          </TabsTrigger>
          <TabsTrigger value="changes">Changes</TabsTrigger>
        </TabsList>

        <TabsContent value="changes" className="space-y-6">
          {ccs.length === 0 ? (
            <EmptyState
              icon={GitPullRequest}
              message="No change controls touch this document yet."
            />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Change control</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ccs.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link
                          href={`/changes/${c.id}`}
                          className="font-mono text-xs underline-offset-4 hover:underline"
                        >
                          {String(c.id).slice(0, 8)}
                        </Link>
                      </TableCell>
                      <TableCell>{c.type ?? "—"}</TableCell>
                      <TableCell>
                        <StatusBadge value={c.status} kind="change" dot />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {request && (
            <SectionCard
              title="Changes requested"
              description={`${request.stage ?? "review"} — ${request.reason ?? ""}`}
            >
              <div className="space-y-6">
                <ActionForm action={updateDraft} submitLabel="Save changes">
                  <input type="hidden" name="document_id" value={doc.id} />
                  <div className="space-y-2">
                    <Label htmlFor="title">Title</Label>
                    <Input id="title" name="title" defaultValue={doc.title ?? ""} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="content_ref">Content reference / upload URL</Label>
                    <Input
                      id="content_ref"
                      name="content_ref"
                      defaultValue={version?.content_ref ?? ""}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reason">Reason for change</Label>
                    <Textarea
                      id="reason"
                      name="reason"
                      rows={2}
                      defaultValue={version?.reason_for_change ?? ""}
                    />
                  </div>
                </ActionForm>

                <ActionForm action={resubmitDocument} submitLabel="Resubmit">
                  <input type="hidden" name="document_id" value={doc.id} />
                </ActionForm>
              </div>
            </SectionCard>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
