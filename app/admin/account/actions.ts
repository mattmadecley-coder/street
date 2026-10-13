"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actorOf, requirePrincipal } from "@/lib/admin-guard";
import { findUserById, revokeSession, revokeUserSessions, updateUser } from "@/lib/admin-users";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/admin-passwords";
import { generateTotpSecret, verifyTotp } from "@/lib/admin-totp";
import { requiresTwoFactor } from "@/lib/admin-permissions";
import { recordAudit } from "@/lib/audit";

function fail(message: string, hash = ""): never {
  redirect(`/admin/account?error=${encodeURIComponent(message)}${hash}`);
}

async function currentUser() {
  const principal = await requirePrincipal();
  if (principal.kind !== "user" || !principal.id) fail("You are signed in with the shared password. Create a personal account in Team first.");
  const user = await findUserById(principal.id);
  if (!user || !user.is_active) fail("Your account could not be found.");
  return { principal, user };
}

export async function changePassword(formData: FormData) {
  const { principal, user } = await currentUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!(await verifyPassword(current, user.password_hash))) fail("Your current password is not right.", "#password");
  if (next !== confirm) fail("The two new passwords do not match.", "#password");
  if (next === current) fail("Choose a password you have not been using.", "#password");
  const problem = passwordProblem(next, { email: user.email, name: user.name });
  if (problem) fail(problem, "#password");

  await updateUser(user.id, { password_hash: await hashPassword(next), must_change_password: false });
  if (principal.sessionId) await revokeUserSessions(user.id, principal.sessionId);
  await recordAudit(actorOf(principal), { action: "account.password_change", targetType: "user", targetId: user.id, summary: "Changed their password and signed out other devices" });
  revalidatePath("/admin", "layout");
  redirect("/admin/account?saved=1");
}

/** Generates a fresh secret and stores it as "pending"; two-step sign-in only turns on once a code from it is confirmed. */
export async function startTotpSetup() {
  const { user } = await currentUser();
  if (user.totp_enabled) fail("Two-step sign-in is already on.", "#two-factor");
  await updateUser(user.id, { totp_secret: generateTotpSecret(), totp_enabled: false, totp_last_step: null });
  redirect("/admin/account#two-factor");
}

export async function confirmTotpSetup(formData: FormData) {
  const { principal, user } = await currentUser();
  if (user.totp_enabled) redirect("/admin/account#two-factor");
  if (!user.totp_secret) fail("Start the setup first.", "#two-factor");
  const step = verifyTotp(user.totp_secret, String(formData.get("code") ?? ""), Date.now());
  if (step === null) fail("That code did not match. Wait for the app to show a new code and try again. If it keeps failing, set your phone's date and time to automatic.", "#two-factor");
  await updateUser(user.id, { totp_enabled: true, totp_last_step: step });
  await recordAudit(actorOf(principal), { action: "account.2fa_enabled", targetType: "user", targetId: user.id, summary: "Turned on two-step sign-in" });
  revalidatePath("/admin", "layout");
  redirect("/admin/account?saved=1#two-factor");
}

export async function disableTotp(formData: FormData) {
  const { principal, user } = await currentUser();
  if (requiresTwoFactor(user.role)) fail("Two-step sign-in is required for your role. Ask an owner to reset it if you lost your device.", "#two-factor");
  if (!(await verifyPassword(String(formData.get("password") ?? ""), user.password_hash))) fail("Your password is not right.", "#two-factor");
  await updateUser(user.id, { totp_enabled: false, totp_secret: null, totp_last_step: null });
  await recordAudit(actorOf(principal), { action: "account.2fa_disabled", targetType: "user", targetId: user.id, summary: "Turned off two-step sign-in" });
  redirect("/admin/account?saved=1#two-factor");
}

export async function signOutOtherDevices() {
  const { principal, user } = await currentUser();
  await revokeUserSessions(user.id, principal.sessionId ?? undefined);
  await recordAudit(actorOf(principal), { action: "account.sessions_revoked", targetType: "user", targetId: user.id, summary: "Signed out all other devices" });
  redirect("/admin/account?saved=1#sessions");
}

export async function signOutDevice(formData: FormData) {
  const { principal, user } = await currentUser();
  const id = String(formData.get("session_id") ?? "");
  if (id === principal.sessionId) fail("Use Log out to end this session.", "#sessions");
  // Only revoke sessions that belong to this user.
  const { listActiveSessions } = await import("@/lib/admin-users");
  const mine = (await listActiveSessions(user.id)).some((session) => session.id === id);
  if (!mine) fail("That session was not found.", "#sessions");
  await revokeSession(id);
  await recordAudit(actorOf(principal), { action: "account.session_revoked", targetType: "user", targetId: user.id, summary: "Signed out one device" });
  redirect("/admin/account?saved=1#sessions");
}
