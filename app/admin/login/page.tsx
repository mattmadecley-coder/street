import { cookies } from "next/headers";
import styles from "@/app/admin/admin.module.css";
import { isAdminConfigured } from "@/lib/admin-auth";
import { accountsStatus } from "@/lib/admin-users";
import { safeAdminPath } from "@/lib/safe-redirect";
import { login } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

const MESSAGES: Record<string, string> = {
  invalid: "Wrong email or password. Try again.",
  "code-needed": "Enter the 6-digit code from your authenticator app.",
  "bad-code": "That code did not work. Wait for the app to show a new code, then try again. If it keeps failing, set your phone's date and time to automatic.",
  "not-configured": "Sign-in is not set up. Add ADMIN_PASSWORD to the app's environment variables in your hosting dashboard, then redeploy.",
};

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; retry?: string; mode?: string; created?: string }> }) {
  const { error, next, retry, mode, created } = await searchParams;
  const status = await accountsStatus().catch(() => ({ available: false, hasUsers: false }));
  const accountsMode = status.available && status.hasUsers;
  const breakGlass = accountsMode && process.env.ADMIN_ALLOW_LEGACY_LOGIN === "true";
  const sharedPassword = !accountsMode || (breakGlass && mode === "legacy");
  const configured = !sharedPassword || isAdminConfigured();
  const locked = error === "locked";
  const hint = accountsMode ? (await cookies()).get("adm_login_hint")?.value ?? "" : "";
  const safeNext = safeAdminPath(next);

  return (
    <div className={styles.loginWrap}>
      <div className={styles.loginCard}>
        <p className={styles.loginBrand}>STREET ADMIN</p>
        <p className={styles.loginSub}>Sign in to manage the catalog, brands, homepage, and analytics.</p>

        {created ? <p className={styles.notice} role="status">Owner account created. Sign in with your email and password. You will be asked to set up two-step sign-in next.</p> : null}
        {!configured ? <p className={styles.noticeError}>{MESSAGES["not-configured"]}</p> : null}
        {error && MESSAGES[error] ? <p className={styles.noticeError} role="alert">{error === "invalid" && sharedPassword ? "Wrong password. Try again." : MESSAGES[error]}</p> : null}
        {locked ? <p className={styles.noticeError} role="alert">Too many failed attempts. Try again in {retry ?? "a few"} minute{retry === "1" ? "" : "s"}.</p> : null}

        <form action={login} className={styles.form}>
          <input type="hidden" name="next" value={safeNext} />
          {sharedPassword && accountsMode ? <input type="hidden" name="mode" value="legacy" /> : null}
          {!sharedPassword ? (
            <div className={styles.field}>
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" autoComplete="username" defaultValue={hint} required autoFocus={!hint} disabled={locked} />
            </div>
          ) : null}
          <div className={styles.field}>
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus={sharedPassword || Boolean(hint)} disabled={locked} />
          </div>
          {!sharedPassword ? (
            <div className={styles.field}>
              <label htmlFor="code">Authenticator code</label>
              <input id="code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} placeholder="6 digits (if turned on)" disabled={locked} />
            </div>
          ) : null}
          <button type="submit" className={styles.button} disabled={locked}>Sign in</button>
        </form>

        {breakGlass ? (
          <p className={`${styles.rowMeta} u-mt-14`}>
            {sharedPassword ? <a href="/admin/login">Use my own account</a> : <a href="/admin/login?mode=legacy">Use the shared password instead</a>}
          </p>
        ) : null}
      </div>
    </div>
  );
}
