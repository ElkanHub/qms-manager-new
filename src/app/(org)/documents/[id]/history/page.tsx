import Link from "next/link";
import { History } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const fmt = (d: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "—");

// D-HISTORY — read-only version history. Answers "which version was effective when."
// Superseded/retained versions are viewable here for reference. RLS still applies:
// effective versions are tenant-wide; in-flight rows show only to those party to them.
export default async function DocumentHistory({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();
  const supabase = await createClient();
  const { data: document } = await supabase
    .from("documents")
    .select("title, document_number")
    .eq("id", id)
    .maybeSingle();
  const { data: versions } = await supabase
    .from("document_versions")
    .select("id, revision_number, status, effective_from, superseded_at, reason_for_change, created_by, created_at")
    .eq("document_id", id)
    .order("created_at", { ascending: true });

  // Resolve created_by uuids → names (no FK for supabase embed; one lean lookup).
  const authorIds = [...new Set((versions ?? []).map((v) => v.created_by).filter(Boolean))];
  const { data: authors } = authorIds.length
    ? await supabase.from("users").select("id, full_name").in("id", authorIds)
    : { data: [] };
  const nameById = new Map((authors ?? []).map((a) => [a.id, a.full_name]));

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-2">
      <PageHeader
        overline={document?.document_number ?? "—"}
        title={document?.title ?? "Version history"}
        meta="Which version was effective when"
        actions={
          (versions ?? []).some((v) => v.status === "draft") ? (
            <Button asChild>
              <Link href={`/documents/${id}/draft`}>Continue draft →</Link>
            </Button>
          ) : undefined
        }
      />

      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="document" asChild>
            <Link href={`/documents/${id}`}>Document</Link>
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="changes" asChild>
            <Link href={`/documents/${id}/changes`}>Changes</Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {versions?.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rev</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Effective from</TableHead>
              <TableHead>Effective to</TableHead>
              <TableHead>Created by</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {versions.map((v) => (
              <TableRow key={v.id} className={cn(v.status === "effective" && "bg-muted/50")}>
                <TableCell className="font-mono tabular-nums">
                  {v.revision_number != null ? String(v.revision_number).padStart(2, "0") : "—"}
                </TableCell>
                <TableCell>
                  <StatusBadge value={v.status} kind="version" dot />
                </TableCell>
                <TableCell>{fmt(v.effective_from)}</TableCell>
                <TableCell>{fmt(v.superseded_at)}</TableCell>
                <TableCell>{nameById.get(v.created_by) ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{v.reason_for_change ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyState
          icon={History}
          message="No versions are visible for this document. Effective versions appear tenant-wide; in-flight drafts show only to those party to them."
        />
      )}
    </div>
  );
}
