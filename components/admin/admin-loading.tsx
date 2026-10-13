import styles from "@/app/admin/admin.module.css";
import { Skeleton } from "@/components/admin/ui";

/** Rendered inside the persistent admin layout, so the nav stays put. Shows the page's rough shape while data loads. */
export function AdminLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="adm-skel-page" role="status" aria-live="polite" aria-busy="true">
      <p className={styles.progressPill}>
        <span className={styles.progressDot} />
        {label}
      </p>
      <Skeleton width={240} height={30} />
      <Skeleton width="60%" height={14} />
      <div className="adm-skel-tiles">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="adm-skel-card">
            <Skeleton width="50%" height={12} />
            <Skeleton width="70%" height={28} />
          </div>
        ))}
      </div>
      <div className="adm-skel-card">
        <Skeleton height={14} />
        <Skeleton height={14} />
        <Skeleton width="80%" height={14} />
      </div>
    </div>
  );
}
