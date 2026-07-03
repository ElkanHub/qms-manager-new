"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Eraser, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { saveSignatureByToken } from "@/app/(auth)/onboarding/signature-actions";

export function PhoneSignPad({ token }: { token: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [state, setState] = useState<"signing" | "done" | "error">("signing");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = 220 * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.offsetWidth, 220);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  if (state === "done")
    return (
      <p className="flex items-center gap-2 py-8 text-center text-[var(--status-effective,#16a34a)]">
        <Check className="size-5" /> Signature saved — go back to your other screen.
      </p>
    );

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        className="h-[220px] w-full touch-none rounded-md border bg-white"
        onPointerDown={(e) => {
          drawing.current = true;
          canvasRef.current!.setPointerCapture(e.pointerId);
          const rect = canvasRef.current!.getBoundingClientRect();
          const ctx = canvasRef.current!.getContext("2d")!;
          ctx.beginPath();
          ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const rect = canvasRef.current!.getBoundingClientRect();
          const ctx = canvasRef.current!.getContext("2d")!;
          ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
          ctx.stroke();
          setDirty(true);
        }}
        onPointerUp={() => (drawing.current = false)}
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => {
            const canvas = canvasRef.current!;
            const ctx = canvas.getContext("2d")!;
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            setDirty(false);
          }}
        >
          <Eraser />
          Clear
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={!dirty || pending}
          onClick={() =>
            startTransition(async () => {
              const res = await saveSignatureByToken(token, canvasRef.current!.toDataURL("image/png"));
              if (res.ok) setState("done");
              else setError(res.error);
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Check />}
          Save signature
        </Button>
      </div>
    </div>
  );
}
