"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Plus, Sparkles, Trash2, X, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  addQuestion,
  addSlide,
  deleteQuestion,
  deleteSlide,
  regenerateQuestion,
  reorderQuestions,
  reorderSlides,
  updateQuestion,
  updateSlide,
} from "../../actions";

export type Slide = { id: string; position: number; title: string; body: string; ai_draft: unknown };
export type Question = {
  id: string;
  position: number;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
  ai_draft: unknown;
};

// T-REVIEW (plan §10): the polish surface. Click into any text to edit inline,
// drag the handle to reorder, add/delete/regenerate. Every edit is a
// server-guarded, audited RPC; this component is presentation + optimism only.
// Editing is possible only in draft_review — the server enforces it, the
// `editable` flag merely hides the affordances.

function SortableCard({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled: boolean;
  children: (handleProps: Record<string, unknown>) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "z-10 opacity-80" : undefined}
    >
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slides
// ---------------------------------------------------------------------------
export function SlideList({
  packageId,
  slides: initial,
  editable,
}: {
  packageId: string;
  slides: Slide[];
  editable: boolean;
}) {
  const [slides, setSlides] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = slides.findIndex((s) => s.id === active.id);
    const newIndex = slides.findIndex((s) => s.id === over.id);
    const next = arrayMove(slides, oldIndex, newIndex);
    setSlides(next);
    startTransition(async () => {
      const res = await reorderSlides(packageId, next.map((s) => s.id));
      if (!res.ok) {
        setSlides(slides);
        toast.error(res.error);
      }
    });
  }

  function save(slide: Slide, title: string, body: string) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("slide_id", slide.id);
      fd.set("package_id", packageId);
      fd.set("title", title);
      fd.set("body", body);
      const res = await updateSlide(fd);
      if (res.ok) {
        setSlides((cur) => cur.map((s) => (s.id === slide.id ? { ...s, title, body } : s)));
        setEditing(null);
      } else toast.error(res.error);
    });
  }

  function remove(slide: Slide) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("slide_id", slide.id);
      fd.set("package_id", packageId);
      const res = await deleteSlide(fd);
      if (res.ok) setSlides((cur) => cur.filter((s) => s.id !== slide.id));
      else toast.error(res.error);
    });
  }

  function add() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("package_id", packageId);
      fd.set("title", "New slide");
      const res = await addSlide(fd);
      if (!res.ok) toast.error(res.error);
      // Server assigns id/position — simplest correct refresh:
      else window.location.reload();
    });
  }

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={slides.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {slides.map((slide, i) => (
            <SortableCard key={slide.id} id={slide.id} disabled={!editable || editing !== null}>
              {(handle) => (
                <Card>
                  <CardContent className="flex gap-3 p-4">
                    {editable && (
                      <button
                        type="button"
                        className="mt-1 cursor-grab text-muted-foreground hover:text-foreground"
                        aria-label={`Reorder slide ${i + 1}`}
                        {...handle}
                      >
                        <GripVertical className="size-4" />
                      </button>
                    )}
                    <div className="min-w-0 flex-1">
                      {editing === slide.id ? (
                        <SlideEditForm
                          slide={slide}
                          pending={pending}
                          onSave={save}
                          onCancel={() => setEditing(null)}
                        />
                      ) : (
                        <button
                          type="button"
                          className="w-full cursor-text text-left"
                          onClick={() => editable && setEditing(slide.id)}
                          aria-label={editable ? `Edit slide ${i + 1}` : undefined}
                          disabled={!editable}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                            <span className="font-medium">{slide.title || "Untitled"}</span>
                            {slide.ai_draft != null &&
                              JSON.stringify(slide.ai_draft) !==
                                JSON.stringify({ title: slide.title, body: slide.body }) && (
                                <Badge variant="outline" className="text-xs">edited</Badge>
                              )}
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                            {slide.body || "(empty)"}
                          </p>
                        </button>
                      )}
                    </div>
                    {editable && editing !== slide.id && (
                      <div className="flex flex-col gap-1">
                        <Button variant="ghost" size="icon" aria-label={`Edit slide ${i + 1}`}
                          onClick={() => setEditing(slide.id)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={`Delete slide ${i + 1}`}
                          onClick={() => remove(slide)} disabled={pending}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </SortableCard>
          ))}
        </SortableContext>
      </DndContext>
      {editable && (
        <Button variant="outline" size="sm" onClick={add} disabled={pending}>
          <Plus /> Add slide
        </Button>
      )}
    </div>
  );
}

function SlideEditForm({
  slide,
  pending,
  onSave,
  onCancel,
}: {
  slide: Slide;
  pending: boolean;
  onSave: (slide: Slide, title: string, body: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(slide.title);
  const [body, setBody] = useState(slide.body);
  return (
    <div className="space-y-2">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Slide title" autoFocus />
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Slide content" />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSave(slide, title, body)} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Check />} Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X /> Cancel
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------
export function QuestionList({
  packageId,
  questions: initial,
  editable,
}: {
  packageId: string;
  questions: Question[];
  editable: boolean;
}) {
  const [questions, setQuestions] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const next = arrayMove(
      questions,
      questions.findIndex((q) => q.id === active.id),
      questions.findIndex((q) => q.id === over.id),
    );
    setQuestions(next);
    startTransition(async () => {
      const res = await reorderQuestions(packageId, next.map((q) => q.id));
      if (!res.ok) {
        setQuestions(questions);
        toast.error(res.error);
      }
    });
  }

  function remove(q: Question) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("question_id", q.id);
      fd.set("package_id", packageId);
      const res = await deleteQuestion(fd);
      if (res.ok) setQuestions((cur) => cur.filter((x) => x.id !== q.id));
      else toast.error(res.error);
    });
  }

  function regenerate(q: Question) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("question_id", q.id);
      fd.set("package_id", packageId);
      const res = await regenerateQuestion(fd);
      if (!res.ok) toast.error(res.error);
      else window.location.reload();
    });
  }

  function add() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("package_id", packageId);
      const res = await addQuestion(fd);
      if (!res.ok) toast.error(res.error);
      else window.location.reload();
    });
  }

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
          {questions.map((q, i) => (
            <SortableCard key={q.id} id={q.id} disabled={!editable || editing !== null}>
              {(handle) => (
                <Card>
                  <CardContent className="flex gap-3 p-4">
                    {editable && (
                      <button
                        type="button"
                        className="mt-1 cursor-grab text-muted-foreground hover:text-foreground"
                        aria-label={`Reorder question ${i + 1}`}
                        {...handle}
                      >
                        <GripVertical className="size-4" />
                      </button>
                    )}
                    <div className="min-w-0 flex-1">
                      {editing === q.id ? (
                        <QuestionEditForm
                          packageId={packageId}
                          question={q}
                          pending={pending}
                          onSaved={(updated) => {
                            setQuestions((cur) => cur.map((x) => (x.id === q.id ? updated : x)));
                            setEditing(null);
                          }}
                          onCancel={() => setEditing(null)}
                        />
                      ) : (
                        <button
                          type="button"
                          className="w-full cursor-text text-left"
                          onClick={() => editable && setEditing(q.id)}
                          disabled={!editable}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs tabular-nums text-muted-foreground">Q{i + 1}</span>
                            <span className="font-medium">{q.question || "(empty)"}</span>
                          </div>
                          <ul className="mt-2 space-y-1 text-sm">
                            {q.options.map((o, oi) => (
                              <li key={oi} className={oi === q.correct_index ? "font-medium text-status-effective" : "text-muted-foreground"}>
                                {oi === q.correct_index ? "✓" : "•"} {o}
                              </li>
                            ))}
                          </ul>
                          {q.explanation && (
                            <p className="mt-1 text-xs text-muted-foreground">Why: {q.explanation}</p>
                          )}
                        </button>
                      )}
                    </div>
                    {editable && editing !== q.id && (
                      <div className="flex flex-col gap-1">
                        <Button variant="ghost" size="icon" aria-label={`Edit question ${i + 1}`}
                          onClick={() => setEditing(q.id)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={`Regenerate question ${i + 1} from the document`}
                          onClick={() => regenerate(q)} disabled={pending}>
                          <Sparkles className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={`Delete question ${i + 1}`}
                          onClick={() => remove(q)} disabled={pending}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </SortableCard>
          ))}
        </SortableContext>
      </DndContext>
      {editable && (
        <Button variant="outline" size="sm" onClick={add} disabled={pending}>
          <Plus /> Add question
        </Button>
      )}
    </div>
  );
}

function QuestionEditForm({
  packageId,
  question,
  pending,
  onSaved,
  onCancel,
}: {
  packageId: string;
  question: Question;
  pending: boolean;
  onSaved: (q: Question) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(question.question);
  const [options, setOptions] = useState<string[]>(question.options);
  const [correct, setCorrect] = useState(question.correct_index);
  const [explanation, setExplanation] = useState(question.explanation ?? "");
  const [, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("question_id", question.id);
      fd.set("package_id", packageId);
      fd.set("question", text);
      options.forEach((o) => fd.append("options", o));
      fd.set("correct_index", String(correct));
      fd.set("explanation", explanation);
      const res = await updateQuestion(fd);
      if (res.ok) {
        onSaved({ ...question, question: text, options, correct_index: correct, explanation });
      } else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-3">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} autoFocus
        placeholder="Question (must be answerable from the document)" />
      <RadioGroup value={String(correct)} onValueChange={(v) => setCorrect(Number(v))} className="space-y-2">
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <RadioGroupItem value={String(i)} id={`opt-${question.id}-${i}`} aria-label={`Mark option ${i + 1} correct`} />
            <Input value={o} onChange={(e) =>
              setOptions((cur) => cur.map((x, xi) => (xi === i ? e.target.value : x)))} />
            {options.length > 2 && (
              <Button variant="ghost" size="icon" aria-label={`Remove option ${i + 1}`}
                onClick={() => {
                  setOptions((cur) => cur.filter((_, xi) => xi !== i));
                  if (correct === i) setCorrect(0);
                  else if (correct > i) setCorrect(correct - 1);
                }}>
                <X className="size-4" />
              </Button>
            )}
          </div>
        ))}
      </RadioGroup>
      <div className="flex items-center gap-2">
        {options.length < 6 && (
          <Button variant="outline" size="sm" onClick={() => setOptions((cur) => [...cur, ""])}>
            <Plus /> Option
          </Button>
        )}
      </div>
      <div className="space-y-1">
        <Label htmlFor={`why-${question.id}`} className="text-xs">Explanation (shown after the attempt)</Label>
        <Input id={`why-${question.id}`} value={explanation} onChange={(e) => setExplanation(e.target.value)}
          placeholder="Reference the document section" />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Check />} Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X /> Cancel
        </Button>
      </div>
    </div>
  );
}
