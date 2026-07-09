"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_NAME, createAdminSessionToken, isAdminConfigured } from "@/lib/admin-auth";

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin");

  if (!isAdminConfigured()) redirect("/admin/login?error=not-configured");
  if (password !== process.env.ADMIN_PASSWORD) redirect(`/admin/login?error=invalid&next=${encodeURIComponent(next)}`);

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
