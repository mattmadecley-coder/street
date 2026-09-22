import styles from "@/app/admin/admin.module.css";

export function AdminLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className={styles.shell}>
      <div className={styles.topbar}>
        <span className={styles.brand}>STREET ADMIN</span>
      </div>
      <p className={styles.progressPill}>
        <span className={styles.progressDot} />
        {label}
      </p>
    </div>
  );
}
