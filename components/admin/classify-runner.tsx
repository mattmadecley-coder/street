"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/app/admin/admin.module.css";
import { classifyBatchAction } from "@/app/admin/brands/new/actions";

/**
 * Runs the retrying classifier repeatedly until this brand has no products
 * left pending or errored. AI failures receive a broad low-confidence fallback
 * and remain visible in the admin review queue instead of blocking progress.
 */
export function ClassifyRunner({ brandSlug, pendingCount }: { brandSlug: string; pendingCount: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [remaining, setRemaining] = useState(pendingCount);
  const [fallbacks, setFallbacks] = useState(0);

  async function run() {
    setRunning(true);
    try {
      let found = 1;
      while (found > 0) {
        const result = await classifyBatchAction(brandSlug);
        found = result.found;
        setDone((prev) => prev + result.results.length);
        setFallbacks((prev) => prev + result.fallbackCount);
        setRemaining((prev) => Math.max(0, prev - result.results.length));
        if (result.found < result.limit) break;
      }
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  if (remaining === 0 && done === 0) {
    return <p className={styles.rowMeta}>Nothing to classify — every product already has a category.</p>;
  }

  return (
    <div>
      <button type="button" className={styles.button} onClick={run} disabled={running || remaining === 0}>
        {running ? `Classifying… (${done} done)` : remaining === 0 ? "Done classifying" : `Resume classification (${remaining} left)`}
      </button>
      {done > 0 ? (
        <p className={styles.rowMeta} style={{ marginTop: 8 }}>
          {done} processed{fallbacks ? `, ${fallbacks} assigned a broad category for review` : ""}.
        </p>
      ) : null}
    </div>
  );
}
