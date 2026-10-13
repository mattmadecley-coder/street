import styles from "@/app/admin/admin.module.css";
import { Banner, Badge, PageHeader } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/submit-button";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { getPrincipal } from "@/lib/admin-guard";
import { findUserById, listActiveSessions } from "@/lib/admin-users";
import { otpauthUrl } from "@/lib/admin-totp";
import { qrSvg } from "@/lib/admin-qr";
import { ROLE_LABELS, requiresTwoFactor } from "@/lib/admin-permissions";
import { changePassword, confirmTotpSetup, disableTotp, signOutDevice, signOutOtherDevices, startTotpSetup } from "./actions";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your account" };

function shortAgent(agent: string | null) {
  if (!agent) return "Unknown device";
  const browser = /Edg\//.test(agent) ? "Edge" : /Chrome\//.test(agent) ? "Chrome" : /Firefox\//.test(agent) ? "Firefox" : /Safari\//.test(agent) ? "Safari" : "Browser";
  const os = /Windows/.test(agent) ? "Windows" : /Mac OS/.test(agent) ? "macOS" : /Android/.test(agent) ? "Android" : /iPhone|iPad/.test(agent) ? "iOS" : /Linux/.test(agent) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const principal = await getPrincipal();
  if (!principal) redirect("/admin/login?next=%2Fadmin%2Faccount");

  if (principal.kind === "legacy") {
    return (
      <div>
        <PageHeader title="Your account" subtitle="You are signed in with the shared admin password." />
        <Banner tone="info">There is no personal account behind this sign-in yet, so there is nothing to change here. Open <a href="/admin/team">Team</a> to create your own owner account with a password and two-step sign-in.</Banner>
      </div>
    );
  }

  const user = await findUserById(principal.id as string);
  if (!user) redirect("/admin/login");
  const sessions = await listActiveSessions(user.id).catch(() => []);
  const pendingSecret = !user.totp_enabled ? user.totp_secret : null;
  const mustTwoFactor = requiresTwoFactor(user.role);
  const setupUrl = pendingSecret ? otpauthUrl(pendingSecret, user.email) : null;
  const qr = setupUrl ? await qrSvg(setupUrl) : null;

  return (
    <div>
      <PageHeader title="Your account" subtitle={<>{user.name || user.email} · {user.email} · <Badge>{ROLE_LABELS[user.role].label}</Badge></>} />
      {error ? <p className={styles.noticeError} role="alert">{error}</p> : null}
      {principal.mustChangePassword ? <Banner tone="warn">You are using a temporary password. Choose your own below to continue.</Banner> : null}
      {principal.needsTwoFactorSetup ? <Banner tone="warn">Your role requires two-step sign-in. Set it up below to continue.</Banner> : null}

      <section className={styles.section} id="password">
        <div className={styles.sectionHead}><div><h2>Password</h2><p className={styles.rowMeta}>At least 12 characters. Changing it signs you out everywhere else.</p></div></div>
        <form action={changePassword} className={styles.form}>
          <div className={styles.field}><label htmlFor="current">{principal.mustChangePassword ? "Temporary password" : "Current password"}</label><input id="current" name="current" type="password" autoComplete="current-password" required /></div>
          <div className={styles.field}><label htmlFor="next">New password</label><input id="next" name="next" type="password" autoComplete="new-password" minLength={12} required /></div>
          <div className={styles.field}><label htmlFor="confirm">Repeat new password</label><input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} required /></div>
          <SubmitButton pendingText="Saving…" className={styles.button}>Change password</SubmitButton>
        </form>
      </section>

      <section className={styles.section} id="two-factor">
        <div className={styles.sectionHead}>
          <div><h2>Two-step sign-in</h2><p className={styles.rowMeta}>A 6-digit code from an authenticator app (Google Authenticator, 1Password, Authy) on top of your password.{mustTwoFactor ? " Required for your role." : ""}</p></div>
          {user.totp_enabled ? <Badge tone="success">On</Badge> : <Badge tone="warn">Off</Badge>}
        </div>
        {user.totp_enabled ? (
          mustTwoFactor ? (
            <p className={styles.rowMeta}>Two-step sign-in is on and required for your role. If you lose your device, an owner can reset it from Team.</p>
          ) : (
            <form action={disableTotp} className={styles.form}>
              <div className={styles.field}><label htmlFor="disable-password">Password</label><input id="disable-password" name="password" type="password" autoComplete="current-password" required /></div>
              <ConfirmSubmitButton confirmTitle="Turn off two-step sign-in?" confirmText="Your account will go back to password only." confirmLabel="Turn off" className={styles.buttonSecondary}>Turn off two-step sign-in</ConfirmSubmitButton>
            </form>
          )
        ) : pendingSecret ? (
          <div className={styles.form}>
            <ol className="adm-steps">
              <li><strong>Install an authenticator app</strong> on your phone if you do not have one (Google Authenticator, Microsoft Authenticator, 1Password or Authy).</li>
              <li><strong>Add this account.</strong> Open the app, tap <strong>+</strong> (or <strong>Add account</strong>) and choose <strong>Scan a QR code</strong>. Point the camera at the square below.</li>
              <li><strong>Or type the key instead</strong> if you cannot scan: choose <strong>Enter a setup key</strong>, use the account name <strong>{user.email}</strong>, paste the key below and leave the type on <strong>Time based</strong>.</li>
              <li><strong>Type the 6-digit code</strong> the app now shows for Street Admin into the box at the bottom and press the button. The code changes every 30 seconds, so type it right away.</li>
            </ol>
            {qr ? <div role="img" aria-label="QR code for your authenticator app" style={{ width: 188, height: 188, background: "#fff", padding: 6, borderRadius: 8 }} dangerouslySetInnerHTML={{ __html: qr }} /> : null}
            <p className={styles.rowMeta}>Setup key (spaces do not matter):</p>
            <code className="adm-secret" aria-label="Setup key">{pendingSecret.replace(/(.{4})/g, "$1 ").trim()}</code>
            <p className={styles.rowMeta}>On your phone you can also tap <a href={setupUrl ?? "#"}>add to authenticator</a>. Keep the key private: anyone with it can make valid codes.</p>
            <form action={confirmTotpSetup} className={styles.form}>
              <div className={styles.field}><label htmlFor="code">Code from the app</label><input id="code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} placeholder="123456" required /></div>
              <SubmitButton pendingText="Checking…" className={styles.button}>Turn on two-step sign-in</SubmitButton>
            </form>
            <p className={styles.rowMeta}>If the code is refused, check that your phone's date and time are set to automatic, then try the next code. Afterwards, sign in with your password and then the code from the same app.</p>
          </div>
        ) : (
          <form action={startTotpSetup}><SubmitButton pendingText="Starting…" className={styles.button}>Set up two-step sign-in</SubmitButton></form>
        )}
      </section>

      <section className={styles.section} id="sessions">
        <div className={styles.sectionHead}><div><h2>Where you are signed in</h2><p className={styles.rowMeta}>Sessions last 7 days. Sign out any you do not recognise.</p></div></div>
        {sessions.length ? (
          <table className={styles.table}>
            <thead><tr><th scope="col">Device</th><th scope="col">Signed in</th><th scope="col">Last active</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id}>
                  <th scope="row">{shortAgent(session.user_agent)}{session.id === principal.sessionId ? <> <Badge tone="success">This device</Badge></> : null}</th>
                  <td>{new Date(session.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                  <td>{new Date(session.last_seen_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                  <td>{session.id === principal.sessionId ? null : (
                    <form action={signOutDevice}><input type="hidden" name="session_id" value={session.id} /><SubmitButton pendingText="…" className={styles.buttonSecondary}>Sign out</SubmitButton></form>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className={styles.rowMeta}>No other sessions.</p>}
        {sessions.length > 1 ? (
          <form action={signOutOtherDevices} className="u-mt-14"><SubmitButton pendingText="Signing out…" className={styles.buttonSecondary}>Sign out all other devices</SubmitButton></form>
        ) : null}
      </section>
    </div>
  );
}
