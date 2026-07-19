"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { saveAvatar, clearAvatar } from "@/lib/profile-actions";

// Profile-photo control: shows the current photo (or initials), lets the user
// upload a new one, and remove it. The file is downscaled to a small square
// data URL client-side so what reaches the audited RPC stays well under the
// 300 KB guard. Used both in Settings and the onboarding wizard.
export function AvatarUpload({
  name,
  initialAvatar,
  onSaved,
  preview = false,
}: {
  name: string;
  initialAvatar?: string | null;
  onSaved?: (dataUrl: string | null) => void;
  /** In the onboarding builder's preview, save nothing to the server. */
  preview?: boolean;
}) {
  const [avatar, setAvatar] = useState<string | null>(initialAvatar ?? null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file.");
      return;
    }
    let dataUrl: string;
    try {
      dataUrl = await downscale(file, 256);
    } catch {
      toast.error("Could not read that image.");
      return;
    }
    if (preview) {
      setAvatar(dataUrl);
      onSaved?.(dataUrl);
      return;
    }
    startTransition(async () => {
      const res = await saveAvatar(dataUrl);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setAvatar(dataUrl);
      onSaved?.(dataUrl);
      toast.success("Profile photo updated.");
    });
  }

  function onRemove() {
    if (preview) {
      setAvatar(null);
      onSaved?.(null);
      return;
    }
    startTransition(async () => {
      const res = await clearAvatar();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setAvatar(null);
      onSaved?.(null);
      toast.success("Profile photo removed.");
    });
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar className="h-16 w-16">
        {avatar && <AvatarImage src={avatar} alt={name} />}
        <AvatarFallback className="text-lg">{initials || "?"}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-2">
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={onPick} />
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => inputRef.current?.click()}>
            {pending ? <Loader2 className="animate-spin" /> : <Upload />}
            Upload profile image
          </Button>
          {avatar && (
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onRemove}>
              <Trash2 /> Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Optional — your initials show when no photo is set. PNG or JPEG, square looks best.
        </p>
      </div>
    </div>
  );
}

// Load, center-crop to a square, and scale to `size`px; return a compact data URL.
function downscale(file: File, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no canvas context"));
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      resolve(canvas.toDataURL("image/webp", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image load failed"));
    };
    img.src = url;
  });
}
