"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ActionForm } from "@/app/_components/ActionForm";
import { generatePackage } from "../actions";

const TEMPLATES = [
  { key: "clean-corporate", label: "Clean corporate", hint: "Concise, formal, one idea per slide" },
  { key: "visual-steps", label: "Visual steps", hint: "Numbered procedure steps, one per slide" },
  { key: "compact-brief", label: "Compact brief", hint: "Fewest slides that still cover it" },
  { key: "detailed-walkthrough", label: "Detailed walkthrough", hint: "Thorough, includes responsibilities" },
  { key: "change-summary", label: "Change summary", hint: "Leads with what changed in this revision" },
];

type Candidate = {
  document_id: string;
  number: string | null;
  title: string;
  version_id: string;
  revision: number | null;
  reason_for_change: string | null;
};

// The generation door (plan §5/§6): trainer picks the template, sets the
// question count, and supplies the document text the AI is grounded in.
// The result is a DRAFT — the human gate comes next on T-REVIEW.
export function GeneratePackageDialog({ candidate }: { candidate: Candidate }) {
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState("clean-corporate");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Sparkles />
          Generate package
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate training package</DialogTitle>
          <DialogDescription>
            {candidate.number ?? "—"} · {candidate.title}
            {candidate.revision != null ? ` · rev ${String(candidate.revision).padStart(2, "0")}` : ""}.
            Slides and questions are derived strictly from the text you provide — the AI draft
            then waits for your review and approval.
          </DialogDescription>
        </DialogHeader>
        <ActionForm action={generatePackage} submitLabel="Generate draft">
          <input type="hidden" name="version_id" value={candidate.version_id} />
          <input type="hidden" name="doc_number" value={candidate.number ?? ""} />
          <input type="hidden" name="doc_title" value={candidate.title} />
          <input type="hidden" name="revision" value={candidate.revision ?? ""} />
          <input type="hidden" name="reason_for_change" value={candidate.reason_for_change ?? ""} />
          <input type="hidden" name="template_key" value={template} />

          <div className="space-y-2">
            <Label>Template</Label>
            <Select value={template} onValueChange={setTemplate}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATES.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    <span className="font-medium">{t.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{t.hint}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="question_count">Questions</Label>
              <Input id="question_count" name="question_count" type="number" min={3} max={25} defaultValue={5} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pass_mark">Pass mark override (%)</Label>
              <Input id="pass_mark" name="pass_mark" type="number" min={1} max={100} placeholder="tenant default" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="source_text">Document content (grounding text)</Label>
            <Textarea
              id="source_text"
              name="source_text"
              rows={8}
              required
              placeholder="Paste the approved content of this document version. Every slide and every question is generated from this text only."
            />
            <p className="text-xs text-muted-foreground">
              Open the document in the viewer and copy its text here. A question that cannot be
              answered from this text is defective and should be deleted in review.
            </p>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
