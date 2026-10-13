import "./admin-ui.css";
import { Suspense } from "react";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminChrome } from "@/components/admin/admin-chrome";
import { COLLAPSE_COOKIE, THEME_COOKIE, parseTheme } from "@/components/admin/chrome-state";
import { AlertsBell, AlertsBellPlaceholder } from "@/components/admin/alerts-bell";
import { getAdminTimeZone } from "@/lib/admin-timezone";
import { getPrincipal } from "@/lib/admin-guard";

export const metadata: Metadata = {
  title: { default: "Street Admin", template: "%s · Street Admin" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const [timeZone, store, principal] = await Promise.all([getAdminTimeZone(), cookies(), getPrincipal()]);
  const initialTheme = parseTheme(store.get(THEME_COOKIE)?.value);
  const initialCollapsed = store.get(COLLAPSE_COOKIE)?.value === "1";
  return (
    <AdminChrome
      timeZone={timeZone}
      user={principal ? { name: principal.name, email: principal.email, role: principal.role, kind: principal.kind } : null}
      initialTheme={initialTheme}
      initialCollapsed={initialCollapsed}
      bell={
        <Suspense fallback={<AlertsBellPlaceholder />}>
          <AlertsBell />
        </Suspense>
      }
    >
      {children}
    </AdminChrome>
  );
}
