"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/app/admin/admin.module.css";
import { classifyBatchAction } from "@/app/admin/brands/new/actions";

/**
 * Runs classifyBatchAction repeatedly (client-side loop, no page reloads)
 * until this brand has no products left with classification_status=pending.
 * Each call is capped server-side (see CLASSIFICATION_BATCH_MAX in
 * lib/catalog-store.ts) to stay well inside a function timeout, so a brand
 * with a large catalog just takes a few rounds instead of one long call.
 */
export function ClassifyRunner({ brandSlug, pendingCount }: { brandSlug: string; pendingCount: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [remaining, setRemaining] = useState(pendingCount);
  const [errors, setErrors] = useState(0);

  async function run() {
    setRunning(true);
    try {
      let found = 1;
      while (found > 0) {
        const result = await classifyBatchAction(brandSlug);
        found = result.found;
        setDone((prev) => prev + result.results.length);
        setErrors((prev) => prev + result.results.filter((item) => item.status === "error").length);
        setRemaining((prev) => Math.max(0, prev - result.results.length));
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
      {done > 0 ? <p className={styles.rowMeta} style={{ marginTop: 8 }}>{done} processed{errors ? `, ${errors} failed (see /admin/products)` : ""}.</p> : null}
    </div>
  );
}
