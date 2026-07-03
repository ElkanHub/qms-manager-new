"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Eraser, Loader2, QrCode, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InitialsSignature } from "@/components/app/initials-signature";
import {
  saveSignature,
  createSignatureQr,
  signatureStatus,
} from "@/app/(auth)/onboarding/signature-actions";

// D-SIGNATURE — collect the signature everyone will sign documents with.
// Three ways in: draw on this screen, scan a QR and draw on the phone
// (single-use 15-minute token), or upload an image. The initials signature is
// generated from the name and shown beside it — both become signing options.
export function SignatureCapture({
  fullName,
  initialSignature,
  preview = false,
  onCaptured,
}: {
  fullName: string;
  /** Existing signature data URL, when re-running onboarding. */
  initialSignature?: string | null;
  /** Preview mode (flow builder): everything works locally, nothing saves. */
  preview?: boolean;
  onCaptured?: () => void;
}) {
  const [captured, setCaptured] = useState<string | null>(initialSignature ?? null);
  const [pending, startTransition] = useTransition();

  function persist(image: string, source: "drawn" | "uploaded") {
    if (preview) {
      setCaptured(image);
      toast.info("Preview — the signature is not saved.");
      return;
    }
    startTransition(async () => {
      const res = await saveSignature(image, source);
      if (res.ok) {
        setCaptured(image);
        onCaptured?.();
        toast.success("Signature saved.");
      } else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="draw">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="draw">Draw</TabsTrigger>
          <TabsTrigger value="phone">
            <QrCode className="mr-1 size-4" />
            Sign on phone
          </TabsTrigger>
          <TabsTrigger value="upload">
            <Upload className="mr-1 size-4" />
            Upload
          </TabsTrigger>
        </TabsList>

        <TabsContent value="draw">
          <DrawPad onDone={(img) => persist(img, "drawn")} busy={pending} />
        </TabsContent>

        <TabsContent value="phone">
          <PhonePanel
            preview={preview}
            onCaptured={() => {
              setCaptured("phone");
              onCaptured?.();
            }}
          />
        </TabsContent>

        <TabsContent value="upload">
          <UploadPanel onDone={(img) => persist(img, "uploaded")} busy={pending} />
        </TabsContent>
      </Tabs>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Your signature</p>
          {captured && captured !== "phone" ? (
            // eslint-disable-next-line @next/next/no-img-element -- small data URL
            <img
              src={captured}
              alt="Captured signature"
              className="h-16 rounded-md border bg-white object-contain px-2"
            />
          ) : captured === "phone" ? (
            <span className="inline-flex h-16 items-center gap-2 rounded-md border px-4 text-sm text-[var(--status-effective,#16a34a)]">
              <Check className="size-4" /> Captured on your phone
            </span>
          ) : (
            <span className="inline-flex h-16 items-center rounded-md border border-dashed px-4 text-sm text-muted-foreground">
              Not captured yet
            </span>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Your initials (auto-generated)</p>
          <InitialsSignature fullName={fullName} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Both are attached to your profile and become your options whenever you sign a document.
      </p>
    </div>
  );
}

// ---- Draw pad (mouse + touch) ----
function DrawPad({ onDone, busy }: { onDone: (dataUrl: string) => void; busy: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = 180 * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.offsetWidth, 180);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="h-[180px] w-full cursor-crosshair touch-none rounded-md border bg-white"
        onPointerDown={(e) => {
          drawing.current = true;
          canvasRef.current!.setPointerCapture(e.pointerId);
          const ctx = canvasRef.current!.getContext("2d")!;
          const { x, y } = pos(e);
          ctx.beginPath();
          ctx.moveTo(x, y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = canvasRef.current!.getContext("2d")!;
          const { x, y } = pos(e);
          ctx.lineTo(x, y);
          ctx.stroke();
          setDirty(true);
        }}
        onPointerUp={() => (drawing.current = false)}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
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
          size="sm"
          disabled={!dirty || busy}
          onClick={() => onDone(canvasRef.current!.toDataURL("image/png"))}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Check />}
          Use this signature
        </Button>
      </div>
    </div>
  );
}

// ---- Phone panel: QR → sign on the phone → desktop polls until captured ----
function PhonePanel({ preview, onCaptured }: { preview: boolean; onCaptured: () => void }) {
  const [qr, setQr] = useState<{ qrDataUrl: string; url: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const since = useRef<string | null>(null);

  useEffect(() => {
    if (!qr || done) return;
    const t = setInterval(async () => {
      const s = await signatureStatus();
      if (s.hasSignature && s.source === "phone" && s.updatedAt !== since.current) {
        setDone(true);
        onCaptured();
        toast.success("Signature captured on your phone.");
      }
    }, 3000);
    return () => clearInterval(t);
  }, [qr, done, onCaptured]);

  if (preview)
    return (
      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        In the real flow a QR code appears here — the person scans it and signs on their phone.
      </p>
    );

  return (
    <div className="space-y-3">
      {!qr ? (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const s = await signatureStatus();
              since.current = s.updatedAt;
              const res = await createSignatureQr();
              if (res.ok) setQr({ qrDataUrl: res.qrDataUrl, url: res.url });
              else toast.error(res.error);
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <QrCode />}
          Generate QR code
        </Button>
      ) : done ? (
        <p className="flex items-center gap-2 text-sm text-[var(--status-effective,#16a34a)]">
          <Check className="size-4" /> Captured — you can continue.
        </p>
      ) : (
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
          <img src={qr.qrDataUrl} alt="Scan to sign on your phone" className="size-40 rounded-md border" />
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Scan with your phone camera and sign with your finger. This screen updates by itself.</p>
            <p className="text-xs">The link works once and expires in 15 minutes.</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => setQr(null)}>
              <RefreshCw />
              New code
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Upload panel ----
function UploadPanel({ onDone, busy }: { onDone: (dataUrl: string) => void; busy: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          if (f.size > 300 * 1024) {
            toast.error("Signature image too large (300 KB max).");
            return;
          }
          const reader = new FileReader();
          reader.onload = () => onDone(String(reader.result));
          reader.readAsDataURL(f);
        }}
      />
      <Button type="button" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? <Loader2 className="animate-spin" /> : <Upload />}
        Choose image (PNG/JPEG, max 300 KB)
      </Button>
      <p className="text-xs text-muted-foreground">
        A photo or scan of your handwritten signature on a plain background works best.
      </p>
    </div>
  );
}
