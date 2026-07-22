"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Award, ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { fetchAssessment, saveProgress, submitAssessment } from "../../actions";
import { celebrate } from "@/lib/confetti";

type Slide = { id: string; position: number; title: string; body: string };
type Content = {
  assignment_id: string;
  status: string;
  progress_pct: number;
  due_at: string | null;
  template: string;
  pass_mark: number;
  document: { number: string | null; title: string; revision: number | null };
  branding: { name?: string | null; logo?: string | null; color_primary?: string | null };
  slides: Slide[];
  question_count: number;
};
type AssessmentPayload = {
  attempt_no: number;
  max_attempts: number | null;
  pass_mark: number;
  questions: { id: string; position: number; question: string; options: string[] }[];
};
type SubmitResult = {
  score: number;
  passed: boolean;
  pass_mark: number;
  correct: number;
  total: number;
  attempt_no: number;
  attempts_left: number | null;
  certificate_uid: string | null;
};
type Cert = { certificate_uid: string; score: number; issued_at: string } | null;

// The trainee experience (plan §4 step 3 → 4): resume where you left off,
// progress saved server-side as you advance, assessment only after the deck,
// score + certificate on pass. Branding colors apply when the tenant has them;
// neutral tokens otherwise.
// Per-template visual treatment (plan §5: 5 platform templates). Token-based;
// tenant colors layer on top when present.
const TEMPLATE_STYLE: Record<string, { card: string; title: string; body: string; step: boolean }> = {
  "clean-corporate": { card: "min-h-[16rem]", title: "", body: "text-sm leading-6", step: false },
  "visual-steps": { card: "min-h-[16rem] border-l-4 border-l-status-scheduled", title: "", body: "text-sm leading-6", step: true },
  "compact-brief": { card: "min-h-[10rem]", title: "text-base", body: "text-sm leading-5", step: false },
  "detailed-walkthrough": { card: "min-h-[20rem]", title: "", body: "text-[15px] leading-7", step: false },
  "change-summary": { card: "min-h-[16rem] border-l-4 border-l-status-blocked", title: "", body: "text-sm leading-6", step: false },
};

export function LearnClient({
  content,
  certificate,
  preview = false,
}: {
  content: Content;
  certificate: Cert;
  preview?: boolean;
}) {
  const slides = content.slides;
  const startIndex = useMemo(() => {
    if (content.progress_pct >= 100) return slides.length - 1;
    return Math.min(Math.floor((content.progress_pct / 100) * slides.length), slides.length - 1);
  }, [content.progress_pct, slides.length]);

  const [index, setIndex] = useState(Math.max(0, startIndex));
  const [phase, setPhase] = useState<"slides" | "assessment" | "done">(
    content.status === "completed" ? "done" : content.status === "awaiting_assessment" ? "assessment" : "slides",
  );
  const [assessment, setAssessment] = useState<AssessmentPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [pending, startTransition] = useTransition();

  const accent = content.branding?.color_primary ?? undefined;
  const pct = phase === "slides" ? Math.round(((index + 1) / slides.length) * 100) : 100;

  function advance(next: number) {
    setIndex(next);
    if (preview) {
      // Preview never writes: the trainer is looking, not training.
      if (next === index && index === slides.length - 1) setPhase("assessment");
      return;
    }
    const newPct = Math.round(((next + 1) / slides.length) * 100);
    startTransition(async () => {
      const res = await saveProgress(content.assignment_id, newPct);
      if (res.ok && res.message === "awaiting_assessment") setPhase("assessment");
      if (!res.ok) toast.error(res.error);
    });
  }

  function openAssessment() {
    startTransition(async () => {
      const res = await fetchAssessment(content.assignment_id);
      if (res.ok) setAssessment(res.assessment as AssessmentPayload);
      else toast.error(res.error);
    });
  }

  function submit() {
    startTransition(async () => {
      const res = await submitAssessment(content.assignment_id, answers);
      if (!res.ok) return void toast.error(res.error);
      const r = res.result as SubmitResult;
      setResult(r);
      setAnswers({});
      setAssessment(null);
      if (r.passed) {
        setPhase("done");
        celebrate();
      }
    });
  }

  const header = (
    <div className="mb-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">
          {content.branding?.name ?? ""} · Training
        </p>
        <h1 className="truncate text-xl font-semibold">
          {content.document.number ?? "—"} · {content.document.title}
        </h1>
        <p className="text-xs text-muted-foreground">
          Revision {content.document.revision != null ? String(content.document.revision).padStart(2, "0") : "(pre-release)"} ·
          pass mark {content.pass_mark}%
        </p>
      </div>
      <Badge variant="outline">{content.template}</Badge>
    </div>
  );

  if (phase === "done") {
    const uid = result?.certificate_uid ?? certificate?.certificate_uid;
    return (
      <div>
        {header}
        <Card className="animate-in zoom-in-95 fade-in duration-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="size-5" style={accent ? { color: accent } : undefined} />
              Training complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {result && (
              <p className="text-sm">
                Score: <span className="font-semibold tabular-nums">{result.score}%</span>{" "}
                ({result.correct}/{result.total} correct, attempt {result.attempt_no}).
              </p>
            )}
            {certificate && !result && (
              <p className="text-sm">
                Completed with <span className="font-semibold tabular-nums">{certificate.score}%</span>.
              </p>
            )}
            {uid && (
              <div className="flex items-center gap-3">
                <Button asChild>
                  <a href={`/training/certificates/${uid}`} download>
                    <Download /> Certificate (PDF)
                  </a>
                </Button>
                <span className="font-mono text-xs text-muted-foreground">{uid}</span>
              </div>
            )}
            <Button variant="outline" asChild>
              <Link href="/training">Back to my training</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === "assessment") {
    if (preview) {
      return (
        <div>
          {header}
          <Progress value={100} className="mb-4" />
          <Card>
            <CardContent className="space-y-3 p-6">
              <p className="text-sm text-muted-foreground">
                End of deck. A trainee now takes the {content.question_count}-question assessment
                (pass mark {content.pass_mark}%). Questions are never shown in preview with their
                answers exposed — review them on the package screen.
              </p>
              <Button variant="outline" onClick={() => { setPhase("slides"); setIndex(0); }}>
                Restart preview
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }
    return (
      <div>
        {header}
        <Progress value={100} className="mb-4" />
        {result && !result.passed && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>
              Attempt {result.attempt_no}: {result.score}% — below the {result.pass_mark}% pass mark.
              {result.attempts_left != null
                ? ` ${result.attempts_left} attempt${result.attempts_left === 1 ? "" : "s"} left.`
                : " Review the slides and try again."}
            </AlertDescription>
          </Alert>
        )}
        {!assessment ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-3 p-6">
              <p className="text-sm text-muted-foreground">
                Slides done. The assessment has {content.question_count} question
                {content.question_count === 1 ? "" : "s"}; every attempt is recorded.
              </p>
              <div className="flex gap-2">
                <Button onClick={openAssessment} disabled={pending}>
                  {pending && <Loader2 className="animate-spin" />} Start assessment
                </Button>
                <Button variant="outline" onClick={() => setPhase("slides")}>
                  Review slides
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {assessment.questions.map((q, qi) => (
              <Card key={q.id}>
                <CardContent className="space-y-3 p-4">
                  <p className="text-sm font-medium">
                    <span className="tabular-nums text-muted-foreground">Q{qi + 1}.</span> {q.question}
                  </p>
                  <RadioGroup
                    value={answers[q.id] != null ? String(answers[q.id]) : undefined}
                    onValueChange={(v) => setAnswers((cur) => ({ ...cur, [q.id]: Number(v) }))}
                  >
                    {q.options.map((o, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <RadioGroupItem value={String(oi)} id={`${q.id}-${oi}`} />
                        <Label htmlFor={`${q.id}-${oi}`} className="text-sm font-normal">
                          {o}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </CardContent>
              </Card>
            ))}
            <Button
              onClick={submit}
              disabled={pending || Object.keys(answers).length < assessment.questions.length}
              style={accent ? { backgroundColor: accent } : undefined}
            >
              {pending && <Loader2 className="animate-spin" />}
              Submit answers
            </Button>
          </div>
        )}
      </div>
    );
  }

  const slide = slides[index];
  const style = TEMPLATE_STYLE[content.template] ?? TEMPLATE_STYLE["clean-corporate"];
  return (
    <div>
      {header}
      {preview && (
        <Badge variant="outline" className="mb-2">Preview — nothing is recorded</Badge>
      )}
      <div className="mb-4 space-y-1">
        <Progress value={pct} aria-label={`Slide progress ${pct}%`} />
        <p className="text-right text-xs tabular-nums text-muted-foreground">
          Slide {index + 1} of {slides.length}
        </p>
      </div>
      <Card className={style.card}>
        <CardHeader>
          <CardTitle className={style.title} style={accent ? { color: accent } : undefined}>
            {style.step && (
              <span className="mr-3 inline-flex size-8 items-center justify-center rounded-full bg-status-scheduled/15 text-base tabular-nums text-status-scheduled">
                {index + 1}
              </span>
            )}
            {slide?.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className={"whitespace-pre-wrap " + style.body}>{slide?.body}</p>
        </CardContent>
      </Card>
      <div className="mt-4 flex items-center justify-between">
        <Button variant="outline" onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0}>
          <ChevronLeft /> Back
        </Button>
        {index < slides.length - 1 ? (
          <Button onClick={() => advance(index + 1)} disabled={pending}>
            Next <ChevronRight />
          </Button>
        ) : (
          <Button onClick={() => advance(index)} disabled={pending}
            style={accent ? { backgroundColor: accent } : undefined}>
            {pending && <Loader2 className="animate-spin" />}
            {preview ? "End of deck" : "Finish slides → assessment"}
          </Button>
        )}
      </div>
    </div>
  );
}
