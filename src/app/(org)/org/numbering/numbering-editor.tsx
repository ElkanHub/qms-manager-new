"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Building2, Hash, Type } from "lucide-react";
import { ActionForm } from "@/app/_components/ActionForm";
import { setNumberingFormat } from "../actions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Segment-based numbering (v2): the company arranges SOP-tag, department tag
// and the number in ANY order, with their own separator — SOP-QA-001,
// QA-SOP-001, 001/SOP/QA… The department tag is the originating department
// captured by the starter request; codes are set on the Departments page.

type Segment =
  | { type: "text"; value: string }
  | { type: "department" }
  | { type: "sequence"; pad: number };

type Props = {
  initialSegments: Segment[];
  initialSep: string;
  initialScope: "tenant" | "department";
  nextSeq: number;
  sampleDeptCode: string;
};

export function NumberingEditor({ initialSegments, initialSep, initialScope, nextSeq, sampleDeptCode }: Props) {
  const [segments, setSegments] = useState<Segment[]>(initialSegments);
  const [sep, setSep] = useState(initialSep);
  const [scope, setScope] = useState<"tenant" | "department">(initialScope);

  const hasDept = segments.some((s) => s.type === "department");

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= segments.length) return;
    const next = [...segments];
    [next[i], next[j]] = [next[j], next[i]];
    setSegments(next);
  }

  function toggleDept(on: boolean) {
    if (on && !hasDept) setSegments((cur) => [cur[0], { type: "department" }, ...cur.slice(1)]);
    if (!on && hasDept) setSegments((cur) => cur.filter((s) => s.type !== "department"));
  }

  const preview = segments
    .map((s) =>
      s.type === "text" ? s.value || "SOP"
      : s.type === "department" ? sampleDeptCode
      : String(nextSeq).padStart(s.pad, "0"),
    )
    .join(sep);

  const format = JSON.stringify({ segments, sep, scope });

  const segmentMeta = (s: Segment) =>
    s.type === "text"
      ? { icon: Type, label: "Label" }
      : s.type === "department"
        ? { icon: Building2, label: "Department tag" }
        : { icon: Hash, label: "Number" };

  return (
    <ActionForm action={setNumberingFormat} submitLabel="Save format">
      <input type="hidden" name="format" value={format} />

      <div className="space-y-2">
        {segments.map((s, i) => {
          const meta = segmentMeta(s);
          const Icon = meta.icon;
          return (
            <div key={i} className="flex items-center gap-2 rounded-md border p-2">
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="w-32 text-sm text-muted-foreground">{meta.label}</span>
              {s.type === "text" && (
                <Input
                  value={s.value}
                  onChange={(e) =>
                    setSegments((cur) =>
                      cur.map((x, xi) => (xi === i ? { type: "text", value: e.target.value.toUpperCase() } : x)),
                    )
                  }
                  className="h-8 w-28 font-mono uppercase"
                  aria-label="Label text"
                />
              )}
              {s.type === "department" && (
                <span className="font-mono text-sm">
                  {sampleDeptCode}{" "}
                  <span className="text-xs text-muted-foreground">(originating department)</span>
                </span>
              )}
              {s.type === "sequence" && (
                <span className="flex items-center gap-2 text-sm">
                  <span className="font-mono">{String(nextSeq).padStart(s.pad, "0")}</span>
                  <Label htmlFor="pad" className="text-xs text-muted-foreground">digits</Label>
                  <Input
                    id="pad"
                    type="number"
                    min={1}
                    max={12}
                    value={s.pad}
                    onChange={(e) =>
                      setSegments((cur) =>
                        cur.map((x, xi) =>
                          xi === i
                            ? { type: "sequence", pad: Math.min(12, Math.max(1, Number(e.target.value) || 1)) }
                            : x,
                        ),
                      )
                    }
                    className="h-8 w-16"
                  />
                </span>
              )}
              <span className="ml-auto flex gap-1">
                <Button type="button" variant="ghost" size="icon" aria-label={`Move ${meta.label} up`}
                  onClick={() => move(i, -1)} disabled={i === 0}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Move ${meta.label} down`}
                  onClick={() => move(i, 1)} disabled={i === segments.length - 1}>
                  <ArrowDown className="size-4" />
                </Button>
              </span>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-2 pt-5">
          <Switch id="dept-tag" checked={hasDept} onCheckedChange={toggleDept} />
          <Label htmlFor="dept-tag" className="text-sm font-normal">Department tag</Label>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sep">Separator</Label>
          <Input id="sep" value={sep} onChange={(e) => setSep(e.target.value)} className="w-20 font-mono" />
        </div>
        <div className="space-y-1.5">
          <Label>Counter</Label>
          <Select value={scope} onValueChange={(v) => setScope(v as "tenant" | "department")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tenant">One company-wide counter</SelectItem>
              <SelectItem value="department">Independent per department</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="bg-muted">
        <CardContent className="flex items-baseline gap-2 py-3">
          <span className="text-sm text-muted-foreground">Next number:</span>
          <code className="font-mono text-base font-semibold text-foreground">{preview}</code>
          {scope === "department" && (
            <span className="text-xs text-muted-foreground">(each department counts on its own)</span>
          )}
        </CardContent>
      </Card>
    </ActionForm>
  );
}
