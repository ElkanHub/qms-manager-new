"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, FileUp, Loader2, PlayCircle, SearchCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/app/section-card";
import { importLegacyLibrary, type ImportReport } from "../actions";

// CSV columns (header row required; order free):
//   number, title, department, owner_email (optional), effective_date (optional)
const COLUMNS = ["number", "title", "department", "owner_email", "effective_date"];

// Minimal RFC-4180-ish parser: quoted fields, escaped quotes, CRLF.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

function toRecords(text: string): { rows: Record<string, string>[]; error: string | null } {
  const parsed = parseCsv(text);
  if (parsed.length < 2) return { rows: [], error: "Need a header row plus at least one data row." };
  const header = parsed[0].map((h) => h.trim().toLowerCase());
  if (!header.includes("number") || !header.includes("title") || !header.includes("department")) {
    return { rows: [], error: "The header row must include: number, title, department (owner_email and effective_date are optional)." };
  }
  const rows = parsed.slice(1).map((cells) => {
    const rec: Record<string, string> = {};
    header.forEach((h, i) => {
      if (COLUMNS.includes(h)) rec[h] = (cells[i] ?? "").trim();
    });
    return rec;
  });
  return { rows, error: null };
}

export function ImportClient({ departments }: { departments: { name: string; code: string | null }[] }) {
  const [csv, setCsv] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  // Any edit invalidates the previous dry run — commit re-locks until re-checked.
  function onCsvChange(next: string) {
    setCsv(next);
    setReport(null);
  }

  function run(dryRun: boolean) {
    const { rows, error } = toRecords(csv);
    if (error) { toast.error(error); return; }
    startTransition(async () => {
      const res = await importLegacyLibrary(rows, dryRun);
      if (!res.ok) { toast.error(res.error); return; }
      setReport(res.report);
      if (dryRun) {
        toast.success(`Checked ${res.report.total} rows — ${res.report.importable} importable.`);
      } else {
        toast.success(`${res.report.imported} documents imported.`);
        setCsv("");
      }
    });
  }

  const canCommit = report?.dry_run === true && report.errors.length === 0 && csv.trim() !== "";

  return (
    <div className="space-y-6">
      <SectionCard
        title="Register CSV"
        description="Header row: number, title, department — plus optional owner_email and effective_date (YYYY-MM-DD). Departments match by code or name."
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>Departments:</span>
            {departments.map((d) => (
              <Badge key={d.name} variant="outline" className="font-mono">
                {d.code ?? d.name}
              </Badge>
            ))}
          </div>
          <Textarea
            value={csv}
            onChange={(e) => onCsvChange(e.target.value)}
            rows={10}
            className="font-mono text-xs"
            placeholder={`number,title,department,owner_email,effective_date\nSOP-001,Granulation,PROD,jane@acme.com,2019-03-01\nSOP-002,Blending,PROD,,2020-11-15`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) onCsvChange(await f.text());
                e.target.value = "";
              }}
            />
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              <FileUp />
              Load CSV file
            </Button>
            <Button type="button" variant="secondary" onClick={() => run(true)} disabled={pending || !csv.trim()}>
              {pending ? <Loader2 className="animate-spin" /> : <SearchCheck />}
              Dry run
            </Button>
            <Button type="button" onClick={() => run(false)} disabled={pending || !canCommit}>
              {pending ? <Loader2 className="animate-spin" /> : <PlayCircle />}
              Import {report && canCommit ? `${report.importable} documents` : ""}
            </Button>
            {!canCommit && csv.trim() !== "" && (
              <span className="text-xs text-muted-foreground">
                Import unlocks after a clean dry run.
              </span>
            )}
          </div>
        </div>
      </SectionCard>

      {report && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {report.dry_run ? "Dry-run report" : "Import complete"}
              {report.errors.length === 0 && <CheckCircle2 className="size-4 text-[var(--status-effective)]" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4 text-sm">
              <span><strong>{report.total}</strong> rows</span>
              <span><strong>{report.dry_run ? report.importable : report.imported}</strong> {report.dry_run ? "importable" : "imported"}</span>
              <span><strong>{report.errors.length}</strong> with problems</span>
            </div>

            {report.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertTitle>Fix these rows, then dry-run again</AlertTitle>
                <AlertDescription>
                  <ul className="mt-1 space-y-1 text-sm">
                    {report.errors.map((e) => (
                      <li key={e.row}>
                        Row {e.row}{e.number ? ` (${e.number})` : ""}: {e.problems.join("; ")}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {(report.duplicate_numbers_in_file.length > 0 || report.duplicate_numbers_existing.length > 0) && (
              <Alert>
                <AlertTitle>Historical duplicates — preserved, never renumbered</AlertTitle>
                <AlertDescription className="space-y-1 text-sm">
                  {report.duplicate_numbers_in_file.length > 0 && (
                    <p>Repeated within this file: {report.duplicate_numbers_in_file.join(", ")}</p>
                  )}
                  {report.duplicate_numbers_existing.length > 0 && (
                    <p>Already on the register: {report.duplicate_numbers_existing.join(", ")}</p>
                  )}
                  <p className="text-muted-foreground">
                    Each lands on its own system id; legacy numbers are exempt from going-forward uniqueness.
                  </p>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
