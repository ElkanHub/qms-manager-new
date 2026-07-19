"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getOnlineCount } from "./online-actions";

// The one live cell of the status strip: seeded server-side, then refreshed on a
// steady poll and whenever the tab regains focus, so "online now" stays current
// without reloading the dashboard.
export function OnlineNow({ initial, href }: { initial: number; href: string }) {
  const [count, setCount] = useState(initial);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const n = await getOnlineCount();
        if (active) setCount(n);
      } catch {
        // transient failure — the next tick retries
      }
    };
    const tick = setInterval(refresh, 30_000);
    const onWake = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      active = false;
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, []);

  return (
    <Link href={href} className="flex items-center gap-2 transition-colors hover:text-foreground">
      <span className="size-2 shrink-0 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
      <span className="tabular-nums text-foreground">{count}</span>
      <span>Online now</span>
    </Link>
  );
}
