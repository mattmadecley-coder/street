import { redirect } from "next/navigation";
import styles from "@/app/admin/admin.module.css";
import { Badge, Banner, EmptyState, PageHeader } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/submit-button";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { requireUser } from "@/lib/admin-guard";
import { accountsStatus, listUsers } from "@/lib/admin-users";
import { ROLES, ROLE_LABELS, can } from "@/lib/admin-permissions";
import { takeOneTimeSecret } from "@/lib/one-time-secrets";
import { changeRole, createFirstOwner, inviteUser, resetPassword, resetTwoFactor, setActive, signOutEverywhere } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team" };

function when(value: string | null) {
  return value ? new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Never";
}

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ error?: string; reveal?: string }> }) {
  const { error, reveal } = await searchParams;
  const principal = await requireUser();
  if (!can(principal.role, "team.manage")) redirect("/admin/forbidden?needs=team.manage");

  const status = await accountsStatus().catch(() => ({ available: false, hasUsers: false }));
  const revealed = (() => {
    const text = takeOneTimeSecret(reveal);
    if (!text) return null;
    try { return JSON.parse(text) as { email: string; password: string }; } catch { return null; }
  })();

  if (!status.available) {
    return (
      <div>
        <PageHeader title="Team" subtitle="People who can sign in to the admin, and what each can do." />
        <Banner tone="info">Personal accounts switch on after the <code>20261015_admin_accounts</code> database migration is applied. Until then everyone signs in with the shared password, exactly as today.</Banner>
      </div>
    );
  }

  if (!status.hasUsers) {
    return (
      <div>
        <PageHeader title="Team" subtitle="Move from the shared password to personal accounts." />
        {error ? <p className={styles.noticeError} role="alert">{error}</p> : null}
        <Banner tone="info">Create the first owner account. After you save it, the shared password stops working and you sign in with your own email and password. You will then be asked to turn on two-step sign-in.</Banner>
        <form action={createFirstOwner} className={styles.form}>
          <div className={styles.field}><label htmlFor="name">Your name</label><input id="name" name="name" type="text" autoComplete="name" required /></div>
          <div className={styles.field}><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="username" required /></div>
          <div className={styles.field}><label htmlFor="password">Password (12+ characters)</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required /></div>
          <div className={styles.field}><label htmlFor="confirm">Repeat password</label><input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} required /></div>
          <ConfirmSubmitButton confirmTitle="Switch to personal accounts?" confirmText="The shared admin password will stop working. You will sign in with the email and password you just entered." confirmLabel="Create owner account" className={styles.button}>Create owner account</ConfirmSubmitButton>
        </form>
      </div>
    );
  }

  const users = await listUsers();
  const activeOwners = users.filter((user) => user.is_active && user.role === "owner").length;

  return (
    <div>
      <PageHeader title="Team" subtitle="People who can sign in to the admin, and what each can do." />
      {error ? <p className={styles.noticeError} role="alert">{error}</p> : null}
      {revealed ? (
        <div className="adm-secret-once" role="status">
          <strong>Temporary password for {revealed.email}</strong>
          <p className={styles.rowMeta}>Shown only once. Send it to them privately; they must choose their own password when they first sign in.</p>
          <code>{revealed.password}</code>
        </div>
      ) : null}

      <section className={styles.section}>
        <div className={styles.sectionHead}><h2>People ({users.length})</h2></div>
        <div className={styles.rowList}>
          {users.map((user) => {
            const isSelf = user.id === principal.id;
            const lastOwner = user.is_active && user.role === "owner" && activeOwners <= 1;
            return (
              <details key={user.id} className={styles.row}>
                <summary className={styles.rowSummary}>
                  <span className="u-row-12">
                    <strong>{user.name || user.email}</strong>
                    <span className={styles.rowMeta}>{user.email}</span>
                  </span>
                  <span className="u-row">
                    <Badge>{ROLE_LABELS[user.role].label}</Badge>
                    {!user.is_active ? <Badge tone="danger">Deactivated</Badge> : null}
                    {user.totp_enabled ? <Badge tone="success">2-step</Badge> : <Badge tone="warn">No 2-step</Badge>}
                    {isSelf ? <Badge tone="info">You</Badge> : null}
                  </span>
                </summary>
                <div className={styles.rowBody}>
                  <p className={styles.rowMeta}>Last sign-in: {when(user.last_login_at)} · Added {when(user.created_at)}{user.must_change_password ? " · Has not chosen a password yet" : ""}</p>
                  <div className="u-row u-mt-14">
                    <form action={changeRole} className="u-row">
                      <input type="hidden" name="user_id" value={user.id} />
                      <label className="sr-only" htmlFor={`role-${user.id}`}>Role for {user.email}</label>
                      <select id={`role-${user.id}`} name="role" defaultValue={user.role} disabled={isSelf}>
                        {ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role].label}</option>)}
                      </select>
                      <SubmitButton pendingText="…" className={styles.buttonSecondary} disabled={isSelf}>Change role</SubmitButton>
                    </form>
                  </div>
                  <div className="u-row u-mt-14">
                    <form action={resetPassword}><input type="hidden" name="user_id" value={user.id} />
                      <ConfirmSubmitButton confirmTitle="Reset password?" confirmText={`${user.email} will be signed out everywhere and given a new temporary password.`} confirmLabel="Reset password" className={styles.buttonSecondary}>Reset password</ConfirmSubmitButton>
                    </form>
                    <form action={resetTwoFactor}><input type="hidden" name="user_id" value={user.id} />
                      <ConfirmSubmitButton confirmTitle="Reset two-step sign-in?" confirmText={`${user.email} will have to set up their authenticator app again.`} confirmLabel="Reset two-step" className={styles.buttonSecondary}>Reset two-step</ConfirmSubmitButton>
                    </form>
                    <form action={signOutEverywhere}><input type="hidden" name="user_id" value={user.id} />
                      <SubmitButton pendingText="…" className={styles.buttonSecondary}>Sign out everywhere</SubmitButton>
                    </form>
                    <form action={setActive}><input type="hidden" name="user_id" value={user.id} /><input type="hidden" name="active" value={user.is_active ? "false" : "true"} />
                      {user.is_active ? (
                        <ConfirmSubmitButton confirmTitle="Deactivate this account?" confirmText={`${user.email} will be signed out and unable to sign in. Their history stays in the activity log.`} confirmLabel="Deactivate" danger className={`${styles.buttonSecondary} ${styles.dangerText}`} disabled={isSelf || lastOwner}>Deactivate</ConfirmSubmitButton>
                      ) : (
                        <SubmitButton pendingText="…" className={styles.buttonSecondary}>Reactivate</SubmitButton>
                      )}
                    </form>
                  </div>
                  {isSelf ? <p className={`${styles.rowMeta} u-mt-8`}>You cannot change your own role or deactivate yourself.</p> : null}
                  {lastOwner && !isSelf ? <p className={`${styles.rowMeta} u-mt-8`}>This is the only active owner, so it cannot be deactivated or demoted.</p> : null}
                </div>
              </details>
            );
          })}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><h2>Add a person</h2><p className={styles.rowMeta}>They get a temporary password to change at first sign-in. Owners and admins must also turn on two-step sign-in.</p></div></div>
        <form action={inviteUser} className={styles.form}>
          <div className={styles.field}><label htmlFor="invite-name">Name</label><input id="invite-name" name="name" type="text" required /></div>
          <div className={styles.field}><label htmlFor="invite-email">Email</label><input id="invite-email" name="email" type="email" required /></div>
          <div className={styles.field}>
            <label htmlFor="invite-role">Role</label>
            <select id="invite-role" name="role" defaultValue="editor">
              {ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role].label}: {ROLE_LABELS[role].description}</option>)}
            </select>
          </div>
          <SubmitButton pendingText="Creating…" className={styles.button}>Create account</SubmitButton>
        </form>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><h2>What each role can do</h2></div>
        <dl className="adm-glossary">
          {ROLES.map((role) => <div key={role}><dt>{ROLE_LABELS[role].label}</dt><dd>{ROLE_LABELS[role].description}</dd></div>)}
        </dl>
      </section>
      {users.length === 0 ? <EmptyState title="No accounts yet" /> : null}
    </div>
  );
}
