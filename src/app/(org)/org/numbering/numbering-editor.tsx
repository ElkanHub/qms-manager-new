"use client";

import { useState } from "react";
import { ActionForm } from "@/app/_components/ActionForm";
import { setNumberingFormat } from "../actions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Format = { prefix: string; sep: string; pad: number };

// Client editor: holds the format fields, renders the "Next:" preview locally,
// and serializes to the exact `format` JSON field setNumberingFormat expects.
export function NumberingEditor({ initial, nextSeq }: { initial: Format; nextSeq: number }) {
  const [prefix, setPrefix] = useState(initial.prefix);
  const [sep, setSep] = useState(initial.sep);
  const [pad, setPad] = useState(initial.pad);

  // Mirror the server render: prefix + sep + zero-padded next sequence.
  const preview = `${prefix}${sep}${String(nextSeq).padStart(pad, "0")}`;
  const format = JSON.stringify({ prefix, sep, pad });

  return (
    <ActionForm action={setNumberingFormat} submitLabel="Save format">
      <input type="hidden" name="format" value={format} />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="prefix">Prefix</Label>
          <Input id="prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sep">Separator</Label>
          <Input id="sep" value={sep} onChange={(e) => setSep(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pad">Digit width</Label>
          <Input
            id="pad"
            type="number"
            min={1}
            max={12}
            value={pad}
            onChange={(e) => setPad(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
      </div>
      <Card className="bg-muted">
        <CardContent className="flex items-baseline gap-2 py-3">
          <span className="text-sm text-muted-foreground">Next:</span>
          <code className="font-mono text-base font-semibold text-foreground">{preview}</code>
        </CardContent>
      </Card>
    </ActionForm>
  );
}
