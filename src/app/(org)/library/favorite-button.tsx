"use client";

import { useOptimistic, useTransition } from "react";
import { Star, StarOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleFavorite } from "./actions";

// Ghost star toggle. Stops row-click propagation so tapping the star never
// follows the row link. Optimistic so the star flips instantly.
export function FavoriteButton({ id, isFavorite }: { id: string; isFavorite: boolean }) {
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(isFavorite);
  const Icon = optimistic ? Star : StarOff;

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={optimistic ? "Unpin from favorites" : "Pin to favorites"}
      onClick={(e) => {
        e.stopPropagation();
        const fd = new FormData();
        fd.set("document_id", id);
        startTransition(async () => {
          setOptimistic(!optimistic);
          await toggleFavorite(fd);
        });
      }}
    >
      <Icon className={optimistic ? "text-foreground" : "text-muted-foreground"} />
    </Button>
  );
}
