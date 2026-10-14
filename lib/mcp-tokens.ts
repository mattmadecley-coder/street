import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { hasSupabaseCatalog, supabaseRest } from "@/lib/supabase-rest";
import { isMissingTableError } from "@/lib/admin-state";
import type { Role } from "@/lib/admin-permissions";
import { isRole } from "@/lib/admin-permissions";

/**
 * Personal access tokens for the admin MCP server (table admin_api_tokens, migration 20261019).
 * A token authenticates as its owner: it can never do more than that person's role allows, and it
 * can only SEND email if `can_send` was switched on when it was created.
 */
export const TOKEN_PREFIX = "street_mcp_";
export const DEFAULT_TOKEN_DAYS = 90;
export const MAX_TOKEN_DAYS = 365;
export const MAX_TOKENS_PER_USER = 10;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function generateToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function looksLikeToken(value: string): boolean {
  return value.startsWith(TOKEN_PREFIX) && value.length >= TOKEN_PREFIX.length + 40 && value.length <= 200 && /^[A-Za-z0-9_-]+$/.test(value);
}

export type TokenRow = { id: string; user_id: string; name: string; token_prefix: string; can_send: boolean; created_at: string; last_used_at: string | null; expires_at: string; revoked_at: string | null };
const COLUMNS = "id,user_id,name,token_prefix,can_send,created_at,last_used_at,expires_at,revoked_at";

export type TokenPrincipal = { tokenId: string; tokenName: string; userId: string; email: string; name: string; role: Role; canSend: boolean };

const line = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

export async function createToken(input: { userId: string; name: unknown; canSend: boolean; days?: unknown }, nowMs: number = Date.now()): Promise<{ token: string; row: TokenRow }> {
  const name = line(input.name, 60);
  if (!name) throw new Error("Give the token a name so you can recognise it later, such as “Claude on my laptop”.");
  const days = Math.min(MAX_TOKEN_DAYS, Math.max(1, Math.floor(Number(input.days)) || DEFAULT_TOKEN_DAYS));
  const existing = await listTokens(input.userId);
  if (existing.filter((row) => !row.revoked_at && Date.parse(row.expires_at) > nowMs).length >= MAX_TOKENS_PER_USER) throw new Error(`You can have up to ${MAX_TOKENS_PER_USER} active tokens. Revoke one you no longer use first.`);
  const token = generateToken();
  const rows = await supabaseRest<TokenRow[]>("admin_api_tokens", {
    method: "POST",
    body: { user_id: input.userId, name, token_prefix: token.slice(0, TOKEN_PREFIX.length + 6), token_hash: hashToken(token), can_send: Boolean(input.canSend), expires_at: new Date(nowMs + days * 86_400_000).toISOString() },
    prefer: "return=representation",
  });
  return { token, row: rows[0] };
}

export async function listTokens(userId: string): Promise<TokenRow[]> {
  if (!hasSupabaseCatalog()) return [];
  try {
    return await supabaseRest<TokenRow[]>(`admin_api_tokens?user_id=eq.${userId}&select=${COLUMNS}&order=created_at.desc&limit=50`, { noStore: true });
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function tokensAvailable(): Promise<boolean> {
  if (!hasSupabaseCatalog()) return false;
  try {
    await supabaseRest("admin_api_tokens?select=id&limit=1", { noStore: true });
    return true;
  } catch (error) {
    if (isMissingTableError(error)) return false;
    throw error;
  }
}

export async function revokeToken(userId: string, tokenId: string, nowMs: number = Date.now()): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(tokenId)) return false;
  const rows = await supabaseRest<Array<{ id: string }>>(`admin_api_tokens?id=eq.${tokenId}&user_id=eq.${userId}&revoked_at=is.null`, { method: "PATCH", body: { revoked_at: new Date(nowMs).toISOString() }, prefer: "return=representation" });
  return rows.length > 0;
}

type UserLite = { id: string; email: string; name: string; role: string; is_active: boolean };

/** Looks a presented token up. Returns null for anything unknown, revoked, expired, or whose owner is inactive. */
export async function verifyToken(presented: string, nowMs: number = Date.now()): Promise<TokenPrincipal | null> {
  if (!looksLikeToken(presented) || !hasSupabaseCatalog()) return null;
  const hash = hashToken(presented);
  let row: (TokenRow & { token_hash: string }) | undefined;
  try {
    row = (await supabaseRest<Array<TokenRow & { token_hash: string }>>(`admin_api_tokens?token_hash=eq.${hash}&select=${COLUMNS},token_hash&limit=1`, { noStore: true }))[0];
  } catch (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
  if (!row) return null;
  const a = Buffer.from(row.token_hash);
  const b = Buffer.from(hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (row.revoked_at || Date.parse(row.expires_at) <= nowMs) return null;
  const user = (await supabaseRest<UserLite[]>(`admin_users?id=eq.${row.user_id}&select=id,email,name,role,is_active&limit=1`, { noStore: true }))[0];
  if (!user || !user.is_active || !isRole(user.role)) return null;
  // Record use at most once a minute so a busy assistant does not hammer the database.
  if (!row.last_used_at || nowMs - Date.parse(row.last_used_at) > 60_000) {
    await supabaseRest(`admin_api_tokens?id=eq.${row.id}`, { method: "PATCH", body: { last_used_at: new Date(nowMs).toISOString() }, prefer: "return=minimal" }).catch(() => undefined);
  }
  return { tokenId: row.id, tokenName: row.name, userId: user.id, email: user.email, name: user.name || user.email, role: user.role, canSend: row.can_send };
}
