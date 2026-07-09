"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_NAME, createAdminSessionToken, isAdminConfigured, checkLoginRateLimit, recordLoginFailure, clearLoginAttempts } from "@/lib/admin-auth";

async function clientIp(): Promise<string> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";
  return requestHeaders.get("x-real-ip") ?? "unknown";
}

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin");

  if (!isAdminConfigured()) redirect("/admin/login?error=not-configured");

  const ip = await clientIp();
  const rateLimit = await checkLoginRateLimit(ip);
  if (rateLimit.locked) redirect(`/admin/login?error=locked&retry=${rateLimit.retryAfterMinutes ?? 15}&next=${encodeURIComponent(next)}`);

  if (password !== process.env.ADMIN_PASSWORD) {
    await recordLoginFailure(ip);
    redirect(`/admin/login?error=invalid&next=${encodeURIComponent(next)}`);
  }

  await clearLoginAttempts(ip);
  const token = await createAdminSessionToken();
  const store = await cookies();
  store.set(ADMIN_COOKIE_NAME, token as string, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(next.startsWith("/admin") ? next : "/admin");
}

export async function logout() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE_NAME);
  redirect("/admin/login");
}
