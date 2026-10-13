"use client";

import { useEffect, useState } from "react";
import styles from "@/app/admin/admin.module.css";

const DISABLED_KEY = "street-analytics-disabled";
const ADMIN_INCLUDE_OVERRIDE_KEY = "street-analytics-admin-include";

function setBrowserExclusion(excluded: boolean) {
  if (excluded) {
    localStorage.setItem(DISABLED_KEY, "true");
    document.cookie = "street_analytics_excluded=true; Path=/; Max-Age=31536000; SameSite=Lax";
  } else {
    localStorage.removeItem(DISABLED_KEY);
    document.cookie = "street_analytics_excluded=; Path=/; Max-Age=0; SameSite=Lax";
  }
}

export function AnalyticsControls({ range, start, end }: { range: string; start: string; end: string }) {
  const [excluded, setExcluded] = useState(true);

  useEffect(() => {
    const explicitlyIncluded = localStorage.getItem(ADMIN_INCLUDE_OVERRIDE_KEY) === "true";
    const nextExcluded = !explicitlyIncluded;
    setBrowserExclusion(nextExcluded);
    setExcluded(nextExcluded);
  }, []);

  function toggleExclusion() {
    const next = !excluded;
    setExcluded(next);
    if (next) localStorage.removeItem(ADMIN_INCLUDE_OVERRIDE_KEY);
    else localStorage.setItem(ADMIN_INCLUDE_OVERRIDE_KEY, "true");
    setBrowserExclusion(next);
  }

  const exportHref = (dataset: string) => `/admin/analytics/export?range=${range}&start=${start}&end=${end}&dataset=${dataset}`;

  return (
    <div className={styles.analyticsToolbar}>
      <button type="button" onClick={toggleExclusion} className={styles.analyticsToggle} aria-pressed={excluded}>
        {excluded ? "This admin browser is excluded" : "Include this browser"}
      </button>
      <span className={styles.rowMeta}>Admin browsers are excluded by default from page views and outbound intent.</span>
      <a href={exportHref("products")} className={styles.analyticsExport}>Export products CSV</a>
      <a href={exportHref("searches")} className={styles.analyticsExport}>Export searches CSV</a>
      <a href={exportHref("events")} className={styles.analyticsExport}>Export events CSV</a>
    </div>
  );
}
