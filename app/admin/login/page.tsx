import styles from "@/app/admin/admin.module.css";
import { isAdminConfigured } from "@/lib/admin-auth";
import { login } from "./actions";

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  const configured = isAdminConfigured();

  return (
    <div className={styles.loginWrap}>
      <div className={styles.loginCard}>
        <p style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-.06em", margin: "0 0 4px" }}>STREET ADMIN</p>
        <p style={{ fontSize: 12, color: "rgba(16,16,16,.6)", margin: "0 0 20px" }}>Sign in to manage the catalog, brands, homepage, and analytics.</p>

        {!configured ? (
          <p className={styles.noticeError}>ADMIN_PASSWORD isn&rsquo;t set. Add it in the Vercel project&rsquo;s Environment Variables, then redeploy.</p>
        ) : null}
        {error === "invalid" ? <p className={styles.noticeError}>Wrong password. Try again.</p> : null}

        <form action={login} className={styles.form}>
          <input type="hidden" name="next" value={next ?? "/admin"} />
          <div className={styles.field}>
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required autoFocus />
          </div>
          <button type="submit" className={styles.button}>Sign in</button>
        </form>
      </div>
    </div>
  );
}
