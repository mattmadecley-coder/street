"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actorOf, getPrincipal, requirePermission } from "@/lib/admin-guard";
import { ADMIN_COOKIE_NAME } from "@/lib/admin-auth";
import { accountsStatus, createUser, findUserByEmail, findUserById, listUsers, looksLikeEmail, normalizeEmail, resetAccountsStatusCache, revokeUserSessions, updateUser } from "@/lib/admin-users";
import { generateTemporaryPassword, hashPassword, passwordProblem } from "@/lib/admin-passwords";
import { isRole, type Role } from "@/lib/admin-permissions";
import { stashOneTimeSecret } from "@/lib/one-time-secrets";
import { recordAudit } from "@/lib/audit";
import { cookies } from "next/headers";

function fail(message: string): never {
  redirect(`/admin/team?error=${encodeURIComponent(message)}`);
}

/** Number of other active owners besides `exceptId`: an account change must never leave the store without one. */
async function otherActiveOwners(exceptId: string): Promise<number> {
  return (await listUsers()).filter((user) => user.is_active && user.role === "owner" && user.id !== exceptId).length;
}

/** Only possible while signed in with the shared password and before any owner exists. */
export async function createFirstOwner(formData: FormData) {
  const principal = await getPrincipal();
  if (!principal || principal.kind !== "legacy") fail("The first owner account can only be created while signed in with the shared password.");
  const status = await accountsStatus();
  if (!status.available) fail("Personal accounts are not set up yet. Apply the 20261015_admin_accounts migration first.");
  if (status.hasUsers) fail("An owner account already exists.");
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!looksLikeEmail(email)) fail("Enter a valid email address.");
  if (!name) fail("Enter your name.");
  if (password !== String(formData.get("confirm") ?? "")) fail("The two passwords do not match.");
  const problem = passwordProblem(password, { email, name });
  if (problem) fail(problem);
  if (await findUserByEmail(email)) fail("An account with that email already exists.");

  const user = await createUser({ email, name, role: "owner", passwordHash: await hashPassword(password), mustChangePassword: false, createdBy: null });
  await recordAudit({ id: user.id, label: email }, { action: "team.first_owner", targetType: "user", targetId: user.id, summary: `Created the first owner account for ${email}` });
  (await cookies()).delete(ADMIN_COOKIE_NAME);
  resetAccountsStatusCache();
  redirect("/admin/login?created=1");
}

export async function inviteUser(formData: FormData) {
  const actor = await requirePermission("team.manage");
  if (!(await accountsStatus()).hasUsers) fail("Create the first owner account before adding other people.");
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  if (!looksLikeEmail(email)) fail("Enter a valid email address.");
  if (!name) fail("Enter their name.");
  if (!isRole(role)) fail("Pick a role.");
  if (await findUserByEmail(email)) fail("An account with that email already exists.");

  const temporary = generateTemporaryPassword();
  const user = await createUser({ email, name, role, passwordHash: await hashPassword(temporary), mustChangePassword: true, createdBy: actor.id });
  await recordAudit(actorOf(actor), { action: "team.user_created", targetType: "user", targetId: user.id, summary: `Created ${role} account for ${email}`, details: { email, role } });
  revalidatePath("/admin/team");
  redirect(`/admin/team?reveal=${stashOneTimeSecret(JSON.stringify({ email, password: temporary }))}`);
}

export async function changeRole(formData: FormData) {
  const actor = await requirePermission("team.manage");
  const id = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!isRole(role)) fail("Pick a role.");
  const target = await findUserById(id);
  if (!target) fail("That person was not found.");
  if (target.id === actor.id) fail("You cannot change your own role.");
  if (target.role === "owner" && role !== "owner" && (await otherActiveOwners(target.id)) === 0) fail("There must always be at least one active owner.");
  await updateUser(target.id, { role: role as Role });
  await revokeUserSessions(target.id);
  await recordAudit(actorOf(actor), { action: "team.role_changed", targetType: "user", targetId: target.id, summary: `Changed ${target.email} from ${target.role} to ${role}`, details: { from: target.role, to: role } });
  revalidatePath("/admin/team");
  redirect("/admin/team?saved=1");
}

export async function setActive(formData: FormData) {
  const actor = await requirePermission("team.manage");
  const id = String(formData.get("user_id") ?? "");
  const active = formData.get("active") === "true";
  const target = await findUserById(id);
  if (!target) fail("That person was not found.");
  if (target.id === actor.id) fail("You cannot deactivate your own account.");
  if (!active && target.role === "owner" && (await otherActiveOwners(target.id)) === 0) fail("There must always be at least one active owner.");
  await updateUser(target.id, { is_active: active });
  if (!active) await revokeUserSessions(target.id);
  await recordAudit(actorOf(actor), { action: active ? "team.user_reactivated" : "team.user_deactivated", targetType: "user", targetId: target.id, summary: `${active ? "Reactivated" : "Deactivated"} ${target.email}` });
  revalidatePath("/admin/team");
  redirect("/admin/team?saved=1");
}

export async function resetPassword(formData: FormData) {
  const actor = await requirePermission("team.manage");
  const target = await findUserById(String(formData.get("user_id") ?? ""));
  if (!target) fail("That person was not found.");
  const temporary = generateTemporaryPassword();
  await updateUser(target.id, { password_hash: await hashPassword(temporary), must_change_password: true });
  await revokeUserSessions(target.id);
  await recordAudit(actorOf(actor), { action: "team.password_reset", targetType: "user", targetId: target.id, summary: `Reset the password for ${target.email}` });
  revalidatePath("/admin/team");
  redirect(`/admin/team?reveal=${stashOneTimeSecret(JSON.stringify({ email: target.email, password: temporary }))}`);
}

export async function resetTwoFactor(formData: FormData) {
  const actor = await requirePermission("team.manage");
  const target = await findUserById(String(formData.get("user_id") ?? ""));
  if (!target) fail("That person was not found.");
  await updateUser(target.id, { totp_enabled: false, totp_secret: null, totp_last_step: null });
  await revokeUserSessions(target.id);
  await recordAudit(actorOf(actor), { action: "team.2fa_reset", targetType: "user", targetId: target.id, summary: `Reset two-step sign-in for ${target.email}` });
  revalidatePath("/admin/team");
  redirect("/admin/team?saved=1");
}

export async function signOutEverywhere(formData: FormData) {
  const actor = await requirePermission("team.manage");
  const target = await findUserById(String(formData.get("user_id") ?? ""));
  if (!target) fail("That person was not found.");
  await revokeUserSessions(target.id);
  await recordAudit(actorOf(actor), { action: "team.sessions_revoked", targetType: "user", targetId: target.id, summary: `Signed ${target.email} out everywhere` });
  redirect("/admin/team?saved=1");
}
