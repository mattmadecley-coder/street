"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Silently re-fetches the current server page on an interval, so a status
 * like "Importing..." / "Classifying (12 of 40)..." keeps moving without
 * the admin manually reloading. Render this only while something is
 * actually in progress — the effect (and the interval) is torn down the
 * moment the parent stops rendering it, e.g. once nothing's left pending.
 */
export function AutoRefresh({ intervalMs = 4000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
