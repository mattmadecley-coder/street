import styles from "@/app/admin/admin.module.css";
import { Banner, Badge, PageHeader } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/submit-button";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { getPrincipal } from "@/lib/admin-guard";
import { findUserById, listActiveSessions } from "@/lib/admin-users";
import { otpauthUrl } from "@/lib/admin-totp";
import { qrSvg } from "@/lib/admin-qr";
import { ROLE_LABELS, requiresTwoFactor } from "@/lib/admin-permissions";
import { createAiTokenAction, revokeAiTokenAction, changePassword, confirmTotpSetup, disableTotp, signOutDevice, signOutOtherDevices, startTotpSetup } from "./actions";
import { redirect } from "next/navigation";
import { listTokens, tokensAvailable, MAX_TOKEN_DAYS } from "@/lib/mcp-tokens";
import { takeOneTimeSecret } from "@/lib/one-time-secrets";
import { can } from "@/lib/admin-permissions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your account" };

function shortAgent(agent: string | null) {
  if (!agent) return "Unknown device";
  const browser = /Edg\//.test(agent) ? "Edge" : /Chrome\//.test(agent) ? "Chrome" : /Firefox\//.test(agent) ? "Firefox" : /Safari\//.test(agent) ? "Safari" : "Browser";
  const os = /Windows/.test(agent) ? "Windows" : /Mac OS/.test(agent) ? "macOS" : /Android/.test(agent) ? "Android" : /iPhone|iPad/.test(agent) ? "iOS" : /Linux/.test(agent) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string; aitoken?: string }> }) {
  const { error, aitoken } = await searchParams;
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
  const newToken = takeOneTimeSecret(aitoken);
  const [tokens, tokensOn] = await Promise.all([listTokens(user.id), tokensAvailable()]);
  const canSendEmail = can(user.role, "email.send");
  const mcpUrl = "https://streetdotcom.com/api/mcp";
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

      <section className={styles.section} id="ai-access">
        <div className={styles.sectionHead}><div><h2>AI access</h2><p className={styles.rowMeta}>Let an AI assistant (Claude, ChatGPT and others that support MCP) work in the admin as you. It can build segments, email templates and campaign drafts. It can never do more than your role allows, and it cannot email customers unless you turn that on for the token.</p></div></div>
        {!tokensOn ? <Banner tone="warn">AI access switches on after the admin tokens migration is applied (see docs/ADMIN.md).</Banner> : (
          <>
            {newToken ? (
              <Banner tone="success">
                <strong>Your new token</strong> (copy it now; it is shown only once):
                <code className="adm-secret" style={{ display: "block", margin: "8px 0", wordBreak: "break-all" }}>{newToken}</code>
                Treat it like a password. Anyone with it can act as you in the email tools until it expires or you revoke it.
                <details style={{ marginTop: 10 }}>
                  <summary>How to connect it</summary>
                  <p className={styles.rowMeta}><strong>Claude Code:</strong></p>
                  <code className="adm-secret" style={{ display: "block", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{`claude mcp add --transport http street-admin ${mcpUrl} --header "Authorization: Bearer ${newToken}"`}</code>
                  <p className={styles.rowMeta}><strong>Claude Desktop</strong> (settings file, needs Node installed):</p>
                  <code className="adm-secret" style={{ display: "block", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{`{"mcpServers":{"street-admin":{"command":"npx","args":["-y","mcp-remote","${mcpUrl}","--header","Authorization:${'$'}{AUTH}"],"env":{"AUTH":"Bearer ${newToken}"}}}}`}</code>
                  <p className={styles.rowMeta}>Server address for any other MCP client: <code>{mcpUrl}</code> with the header <code>Authorization: Bearer your-token</code>. Then ask the assistant to call <code>email_guide</code> first.</p>
                </details>
              </Banner>
            ) : null}
            <form action={createAiTokenAction} className={styles.form}>
              <div className={styles.field}><label htmlFor="ai-name">Name</label><input id="ai-name" name="name" type="text" maxLength={60} placeholder="e.g. Claude on my laptop" required /></div>
              <div className={styles.field}><label htmlFor="ai-days">Expires after</label><select id="ai-days" name="days" defaultValue="90"><option value="30">30 days</option><option value="90">90 days</option><option value={MAX_TOKEN_DAYS}>1 year</option></select></div>
              {canSendEmail ? <label className={styles.checkboxField}><input type="checkbox" name="can_send" /> Allow this token to schedule and send campaigns to customers (leave off unless you need it; the assistant still must be told to send)</label> : null}
              <div className={styles.field}><label htmlFor="ai-password">Your password</label><input id="ai-password" name="password" type="password" autoComplete="current-password" required /></div>
              <SubmitButton pendingText="Creating…" className={styles.button}>Create token</SubmitButton>
            </form>
            {tokens.length ? (
              <table className={styles.table} style={{ marginTop: 14 }}>
                <thead><tr><th scope="col">Name</th><th scope="col">Token</th><th scope="col">Can send</th><th scope="col">Last used</th><th scope="col">Expires</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {tokens.map((token) => {
                    const inactive = Boolean(token.revoked_at) || Date.parse(token.expires_at) <= Date.now();
                    return (
                      <tr key={token.id} style={inactive ? { opacity: 0.55 } : undefined}>
                        <th scope="row">{token.name}{token.revoked_at ? " (revoked)" : inactive ? " (expired)" : ""}</th>
                        <td><code>{token.token_prefix}…</code></td>
                        <td>{token.can_send ? "Yes" : "No"}</td>
                        <td>{token.last_used_at ? new Date(token.last_used_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Never"}</td>
                        <td>{new Date(token.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                        <td>{inactive ? null : <form action={revokeAiTokenAction}><input type="hidden" name="token_id" value={token.id} /><ConfirmSubmitButton confirmTitle="Revoke this token?" confirmText="Any assistant using it stops working immediately." confirmLabel="Revoke" danger className={styles.buttonSecondary}>Revoke</ConfirmSubmitButton></form>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
          </>
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
