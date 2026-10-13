import { hasSupabaseCatalog, supabaseRest } from "@/lib/supabase-rest";
import { isMissingTableError } from "@/lib/admin-state";
import type { Role } from "@/lib/admin-permissions";

/** Data access for admin accounts and sessions (tables from supabase/migrations/20261015_admin_accounts.sql). Service role only. */
export type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  password_hash: string;
  must_change_password: boolean;
  totp_secret: string | null;
  totp_enabled: boolean;
  totp_last_step: number | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
};

const USER_COLUMNS = "id,email,name,role,password_hash,must_change_password,totp_secret,totp_enabled,totp_last_step,is_active,last_login_at,created_at";

export type AdminSessionRow = {
  id: string;
  user_id: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  ip: string | null;
  user_agent: string | null;
  revoked_at: string | null;
};

const SESSION_COLUMNS = "id,user_id,created_at,last_seen_at,expires_at,ip,user_agent,revoked_at";

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function looksLikeEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) && value.length <= 254;
}

let statusCache: { at: number; available: boolean; hasUsers: boolean } | null = null;

/** Is the accounts table there, and does it have any active owner? Cached briefly. */
export async function accountsStatus(): Promise<{ available: boolean; hasUsers: boolean }> {
  if (statusCache && Date.now() - statusCache.at < 20_000) return statusCache;
  let result = { available: false, hasUsers: false };
  if (hasSupabaseCatalog()) {
    try {
      const rows = await supabaseRest<Array<{ id: string }>>("admin_users?select=id&is_active=eq.true&role=eq.owner&limit=1", { noStore: true });
      result = { available: true, hasUsers: rows.length > 0 };
    } catch (error) {
      if (!isMissingTableError(error)) throw error;
    }
  }
  statusCache = { at: Date.now(), ...result };
  return result;
}

export function resetAccountsStatusCache() {
  statusCache = null;
}

export async function findUserByEmail(email: string): Promise<AdminUser | null> {
  const rows = await supabaseRest<AdminUser[]>(`admin_users?select=${USER_COLUMNS}&email=eq.${encodeURIComponent(normalizeEmail(email))}&limit=1`, { noStore: true });
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<AdminUser | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const rows = await supabaseRest<AdminUser[]>(`admin_users?select=${USER_COLUMNS}&id=eq.${id}&limit=1`, { noStore: true });
  return rows[0] ?? null;
}

export async function listUsers(): Promise<AdminUser[]> {
  return supabaseRest<AdminUser[]>(`admin_users?select=${USER_COLUMNS}&order=created_at.asc`, { noStore: true });
}

export async function createUser(input: { email: string; name: string; role: Role; passwordHash: string; mustChangePassword: boolean; createdBy: string | null }): Promise<AdminUser> {
  const rows = await supabaseRest<AdminUser[]>("admin_users", {
    method: "POST",
    body: {
      email: normalizeEmail(input.email),
      name: input.name.trim().slice(0, 120),
      role: input.role,
      password_hash: input.passwordHash,
      must_change_password: input.mustChangePassword,
      created_by: input.createdBy,
    },
  });
  resetAccountsStatusCache();
  return rows[0];
}

export async function updateUser(id: string, patch: Partial<Pick<AdminUser, "name" | "role" | "password_hash" | "must_change_password" | "totp_secret" | "totp_enabled" | "totp_last_step" | "is_active" | "last_login_at">>): Promise<void> {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid user id.");
  await supabaseRest(`admin_users?id=eq.${id}`, { method: "PATCH", body: { ...patch, updated_at: new Date().toISOString() }, prefer: "return=minimal" });
  resetAccountsStatusCache();
}

export async function createSession(input: { userId: string; expiresAt: Date; ip: string | null; userAgent: string | null }): Promise<AdminSessionRow> {
  const rows = await supabaseRest<AdminSessionRow[]>("admin_sessions", {
    method: "POST",
    body: { user_id: input.userId, expires_at: input.expiresAt.toISOString(), ip: input.ip, user_agent: input.userAgent?.slice(0, 300) ?? null },
  });
  return rows[0];
}

export async function findSession(id: string): Promise<AdminSessionRow | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const rows = await supabaseRest<AdminSessionRow[]>(`admin_sessions?select=${SESSION_COLUMNS}&id=eq.${id}&limit=1`, { noStore: true });
  return rows[0] ?? null;
}

export async function touchSession(id: string): Promise<void> {
  await supabaseRest(`admin_sessions?id=eq.${id}`, { method: "PATCH", body: { last_seen_at: new Date().toISOString() }, prefer: "return=minimal" });
}

export async function revokeSession(id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  await supabaseRest(`admin_sessions?id=eq.${id}&revoked_at=is.null`, { method: "PATCH", body: { revoked_at: new Date().toISOString() }, prefer: "return=minimal" });
}

/** Signs a person out everywhere, optionally keeping the session they are using right now. */
export async function revokeUserSessions(userId: string, exceptSessionId?: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/.test(userId)) return;
  const keep = exceptSessionId && /^[0-9a-f-]{36}$/.test(exceptSessionId) ? `&id=neq.${exceptSessionId}` : "";
  await supabaseRest(`admin_sessions?user_id=eq.${userId}&revoked_at=is.null${keep}`, { method: "PATCH", body: { revoked_at: new Date().toISOString() }, prefer: "return=minimal" });
}

export async function listActiveSessions(userId: string): Promise<AdminSessionRow[]> {
  if (!/^[0-9a-f-]{36}$/.test(userId)) return [];
  const nowIso = encodeURIComponent(new Date().toISOString());
  return supabaseRest<AdminSessionRow[]>(`admin_sessions?select=${SESSION_COLUMNS}&user_id=eq.${userId}&revoked_at=is.null&expires_at=gt.${nowIso}&order=last_seen_at.desc`, { noStore: true });
}
