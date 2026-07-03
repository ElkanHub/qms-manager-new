import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { CopyId } from "@/components/app/copy-id";
import { RoleGate } from "@/components/app/role-gate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GraduationCap, Hourglass, Lock, MoreHorizontal, Timer } from "lucide-react";
import { ActionForm } from "@/app/_components/ActionForm";
import { SectionCard } from "@/components/app/section-card";
import { ReasonDialog } from "@/components/app/reason-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { resolveContentUrl } from "@/lib/content-ref";
import { requestReadAccess, lockDocument, unlockDocument } from "@/app/(org)/library/actions";
import { Viewer } from "./Viewer";

// D-READ — the core document read view. Opens the CURRENT EFFECTIVE version,
// read-only, in the configured viewer. Reachable even if the Library module is off
// (this is the core read surface, never off). Serves only effective versions.
export default async function DocumentRead({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireUser();
  const supabase = await createClient();
  const [{ data, error }, { data: lock }, { data: myRequests }] = await Promise.all([
    supabase.rpc("read_document", { p_document: id }),
    supabase.from("document_locks").select("document_id, reason").eq("document_id", id).maybeSingle(),
    supabase
      .from("read_access_requests")
      .select("id, state, expires_at, decline_reason")
      .eq("document_id", id)
      .eq("requester_id", me.id)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  const doc = data?.[0];
  const myReq = myRequests?.[0] ?? null;

  // Locked and not readable by me: read_document logged the denied attempt and
  // returned no rows — the request-access surface takes over (L-READ-REQUEST).
  if (!error && !doc && lock) {
    const { data: docMeta } = await supabase
      .from("documents").select("document_number, title").eq("id", id).maybeSingle();
    return (
      <div className="mx-auto max-w-lg space-y-6 p-2">
        <PageHeader
          overline={docMeta?.document_number ?? "—"}
          title={docMeta?.title ?? "Restricted document"}
          description="QA has restricted this document. You can request time-limited read access."
        />
        {myReq?.state === "requested" ? (
          <Alert>
            <Hourglass className="size-4" />
            <AlertTitle>Your request is with QA</AlertTitle>
            <AlertDescription>You will be able to open the document once QA grants access.</AlertDescription>
          </Alert>
        ) : (
          <SectionCard
            title="Request access"
            description={myReq?.state === "declined"
              ? `Your previous request was declined${myReq.decline_reason ? `: ${myReq.decline_reason}` : ""}. You may request again with a clearer purpose.`
              : "Tell QA why you need to read this document. Grants carry a time limit and every step is on the audit trail."}
          >
            <ActionForm action={requestReadAccess} submitLabel="Send request to QA">
              <input type="hidden" name="document_id" value={id} />
              <div className="space-y-1.5">
                <Label htmlFor="purpose">Purpose</Label>
                <Textarea id="purpose" name="purpose" required rows={3}
                  placeholder="Why you need to read this document" />
              </div>
            </ActionForm>
          </SectionCard>
        )}
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-2">
        <PageHeader title="Not available" />
        <Alert>
          <AlertDescription>
            {error?.message ?? "This document has no effective version to read."}{" "}
            <Link href="/library" className="font-medium underline underline-offset-4">
              Back to library
            </Link>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const viewerUrl = await resolveContentUrl(doc.rendition_ref);
  const myGrantUntil =
    lock && myReq?.state === "granted" && myReq.expires_at && new Date(myReq.expires_at) > new Date()
      ? new Date(myReq.expires_at)
      : null;

  // Training seam, display side: reading stays open; performing is what's
  // blocked (the transactional guard is app.enforce_trained_for_execution).
  const { data: training } = await supabase.rpc("my_training_status", { p_document: id });
  const trainingBlocked = (training as { blocked?: boolean } | null)?.blocked === true;

  const rev = String(doc.revision_number ?? 0).padStart(2, "0");
  const date = doc.effective_from
    ? new Date(doc.effective_from).toISOString().slice(0, 10)
    : "—";
  const dept = doc.department_name ?? doc.department ?? null;
  const meta = `Revision ${rev} · effective ${date}${dept ? ` · ${dept}` : ""}`;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-2">
      <PageHeader
        overline={doc.document_number ?? "—"}
        status={doc.status ?? "active"}
        title={doc.title}
        meta={meta}
        actions={
          <>
            <RoleGate anyOf={["qa"]}>
              {lock ? (
                <ActionForm action={unlockDocument} submitLabel="Unlock">
                  <input type="hidden" name="document_id" value={id} />
                </ActionForm>
              ) : (
                <ReasonDialog
                  trigger={
                    <Button variant="outline">
                      <Lock />
                      Restrict
                    </Button>
                  }
                  title="Restrict this document"
                  description="Only QA, the owning department, and users with a time-limited grant will be able to read it. Every read and every denied attempt is logged."
                  action={lockDocument}
                  submitLabel="Restrict"
                  hiddenFields={{ document_id: id }}
                />
              )}
            </RoleGate>
            <Button asChild>
              <Link href={`/intake?target=${id}`}>Request a change</Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/documents/${id}/history`}>Version history</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`/audit/export?document=${id}`}>Audit story (CSV)</a>
                </DropdownMenuItem>
                <RoleGate anyOf={["qa"]}>
                  <DropdownMenuItem asChild>
                    <Link href={`/documents/${id}/retire`}>Retire…</Link>
                  </DropdownMenuItem>
                </RoleGate>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <CopyId value={id} label="Copy document id" />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {myGrantUntil && (
        <Alert>
          <Timer className="size-4" />
          <AlertTitle>Temporary access</AlertTitle>
          <AlertDescription>
            QA granted you read access until {myGrantUntil.toLocaleString()} — after that this
            document locks again for you.
          </AlertDescription>
        </Alert>
      )}

      {lock && (
        <Alert>
          <Lock className="size-4" />
          <AlertDescription>
            This document is restricted by QA{lock.reason ? ` — ${lock.reason}` : ""}. Reads are
            individually logged.
          </AlertDescription>
        </Alert>
      )}

      {trainingBlocked && (
        <Alert variant="destructive">
          <GraduationCap className="size-4" />
          <AlertTitle>Training required on this revision</AlertTitle>
          <AlertDescription>
            You may read this document, but you must not perform against it until your
            training is complete.{" "}
            <Link href="/training" className="font-medium underline underline-offset-4">
              Go to my training
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="document">
        <TabsList>
          <TabsTrigger value="document">Document</TabsTrigger>
          <TabsTrigger value="history" asChild>
            <Link href={`/documents/${id}/history`}>History</Link>
          </TabsTrigger>
          <TabsTrigger value="changes" asChild>
            <Link href={`/documents/${id}/changes`}>Changes</Link>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="document">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
              <span className="font-mono text-xs text-muted-foreground">
                {doc.renderer ?? "internal"}
              </span>
              <Badge variant="outline">Read-only rendition</Badge>
            </div>
            <div className="bg-white p-2">
              <Viewer renderer={doc.renderer} renditionRef={viewerUrl} />
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
