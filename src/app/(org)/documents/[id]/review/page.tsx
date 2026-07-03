import Link from "next/link";
import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { extractDocxParagraphs } from "@/lib/extract-docx";
import { resolveContentUrl } from "@/lib/content-ref";
import { PageHeader } from "@/components/app/page-header";
import { ReasonDialog } from "@/components/app/reason-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requestChanges } from "../../actions";
import { Viewer } from "../Viewer";
import { AnnotationView, type ReviewComment } from "./annotation-view";

// D-REVIEW-ANNOTATE — two views of the same draft (addendum §2): the faithful
// MS-online render for reading, and the extracted-text view for highlighting.
// QA/HOD annotate; the author sees every comment pinned to its passage, fixes
// the SOP in Word OUTSIDE the system, and re-uploads. Never an editor.
export default async function ReviewDocument({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireOrgUser();
  const roles = await getMyRoles();
  const canAnnotateRole = roles.includes("qa") || roles.includes("hod");
  const supabase = await createClient();

  const [{ data: doc }, { data: version }] = await Promise.all([
    supabase.from("documents").select("id, document_number, title, status").eq("id", id).maybeSingle(),
    supabase
      .from("document_versions")
      .select("id, status, content_ref, reason_for_change")
      .eq("document_id", id)
      .in("status", ["draft", "in_approval"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!doc || !version) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-2">
        <PageHeader title="Nothing under review" />
        <Alert>
          <AlertDescription>
            This document has no draft in review.{" "}
            <Link href={`/documents/${id}`} className="font-medium underline underline-offset-4">
              Open the effective version
            </Link>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const contentUrl = await resolveContentUrl(version.content_ref);
  const [{ data: comments }, { data: pendingReq }, { paragraphs, error: extractError }] =
    await Promise.all([
      supabase
        .from("review_comments")
        .select("id, quote, prefix, comment, author_id, created_at")
        .eq("document_version_id", version.id)
        .order("created_at"),
      supabase
        .from("approval_requests")
        .select("id, stage")
        .eq("document_id", id)
        .eq("status", "pending")
        .maybeSingle(),
      extractDocxParagraphs(contentUrl),
    ]);
  const authorIds = [...new Set((comments ?? []).map((c) => c.author_id))];
  const { data: authors } = authorIds.length
    ? await supabase.from("users").select("id, email, full_name").in("id", authorIds)
    : { data: [] as { id: string; email: string; full_name: string | null }[] };

  const commentRows: ReviewComment[] = (comments ?? []).map((c) => {
    const a = authors?.find((x) => x.id === c.author_id);
    return {
      id: c.id,
      quote: c.quote,
      prefix: c.prefix,
      comment: c.comment,
      author: a?.full_name ?? a?.email ?? "—",
      at: new Date(c.created_at).toLocaleString(),
    };
  });

  const canAnnotate = canAnnotateRole && (version.status === "draft" || version.status === "in_approval");

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-2">
      <PageHeader
        overline={doc.document_number ?? "Draft"}
        title={doc.title}
        status={version.status}
        description="Review the draft. The annotation view highlights and comments — it never edits; content changes only when the author re-uploads a corrected Word file."
        actions={
          canAnnotate && pendingReq ? (
            <ReasonDialog
              trigger={<Button variant="outline">Request changes</Button>}
              title="Request changes"
              description="Sends the draft back to the author with every anchored comment below."
              action={requestChanges}
              submitLabel="Request changes"
              hiddenFields={{ request_id: pendingReq.id }}
            />
          ) : undefined
        }
      />

      <Tabs defaultValue={canAnnotate ? "annotate" : "faithful"}>
        <TabsList>
          <TabsTrigger value="faithful">Faithful view</TabsTrigger>
          <TabsTrigger value="annotate">Annotation view</TabsTrigger>
        </TabsList>
        <TabsContent value="faithful">
          <Viewer renderer="ms_online" renditionRef={contentUrl} />
          <p className="mt-1 text-xs text-muted-foreground">
            Formatting-faithful render. To flag a specific passage, switch to the annotation view.
          </p>
        </TabsContent>
        <TabsContent value="annotate">
          {extractError ? (
            <Alert>
              <AlertDescription>{extractError}</AlertDescription>
            </Alert>
          ) : (
            <AnnotationView
              versionId={version.id}
              paragraphs={paragraphs}
              initialComments={commentRows}
              canAnnotate={canAnnotate}
            />
          )}
          {extractError && commentRows.length > 0 && (
            <div className="mt-4">
              <AnnotationView
                versionId={version.id}
                paragraphs={[]}
                initialComments={commentRows}
                canAnnotate={false}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
