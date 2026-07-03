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
import { GraduationCap, MoreHorizontal } from "lucide-react";
import { Viewer } from "./Viewer";

// D-READ — the core document read view. Opens the CURRENT EFFECTIVE version,
// read-only, in the configured viewer. Reachable even if the Library module is off
// (this is the core read surface, never off). Serves only effective versions.
export default async function DocumentRead({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("read_document", { p_document: id });
  const doc = data?.[0];

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
              <Viewer renderer={doc.renderer} renditionRef={doc.rendition_ref} />
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
