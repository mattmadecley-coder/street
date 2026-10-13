"use client";

import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/admin/login/actions";
import { Icon } from "@/components/admin/icons";
import { NAV_GROUPS, isNavActive } from "@/components/admin/nav-config";
import { can, ROLE_LABELS, type Role } from "@/lib/admin-permissions";
import { CommandPalette } from "@/components/admin/command-palette";
import { ToastProvider, UrlToast } from "@/components/admin/toast";
import { COLLAPSE_COOKIE, THEME_COOKIE, type ThemeChoice } from "@/components/admin/chrome-state";
import { DateRangePicker, isRangeAwarePath } from "@/components/admin/date-range-picker";



function writeCookie(name: string, value: string) {
  try {
    document.cookie = `${name}=${value}; Path=/admin; Max-Age=31536000; SameSite=Lax`;
  } catch { /* cookies blocked: the choice still applies for this page view */ }
}

/**
 * The persistent frame around every admin page: sidebar, top bar, command
 * palette, toasts. It lives in app/admin/layout.tsx, so it stays mounted while
 * pages stream in. The login screen renders without it.
 *
 * `bell` is a server-rendered slot passed in from the layout (the live alert
 * count). `timeZone` is the store reporting zone that the date-range picker uses.
 */
export type ChromeUser = { name: string; email: string; role: Role; kind: "user" | "legacy" };

export function AdminChrome({ children, bell, timeZone, user = null, initialTheme = "system", initialCollapsed = false }: { children: ReactNode; bell?: ReactNode; timeZone: string; user?: ChromeUser | null; initialTheme?: ThemeChoice; initialCollapsed?: boolean }) {
  const pathname = usePathname() ?? "/admin";
  const [theme, setTheme] = useState<ThemeChoice>(initialTheme);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(media.matches);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPaletteOpen(true); }
      else if (event.key === "/" && !typing) { event.preventDefault(); setPaletteOpen(true); }
      else if (event.key === "Escape") setDrawerOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const effectiveDark = theme === "dark" || (theme === "system" && systemDark);
  const cycleTheme = useCallback(() => {
    const next: ThemeChoice = effectiveDark ? "light" : "dark";
    setTheme(next);
    writeCookie(THEME_COOKIE, next);
  }, [effectiveDark]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      writeCookie(COLLAPSE_COOKIE, current ? "0" : "1");
      return !current;
    });
  }, []);

  const themeAttr = theme === "system" ? undefined : theme;

  if (pathname === "/admin/login") {
    return (
      <div className="adm" data-theme={themeAttr}>
          {children}
      </div>
    );
  }

  return (
    <div className="adm" data-theme={themeAttr}>
      <a className="adm-skip" href="#admin-main">Skip to content</a>
      <ToastProvider>
        <div className="adm-app" data-collapsed={collapsed ? "true" : "false"} data-drawer={drawerOpen ? "open" : "closed"}>
          <aside className="adm-sidebar" aria-label="Primary">
            <div className="adm-sidebar-head">
              <Link href="/admin" className="adm-wordmark" aria-label="Street admin home">STREET<small>ADMIN</small></Link>
              <button type="button" className="adm-icon-btn adm-collapse-btn" onClick={toggleCollapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-pressed={collapsed}>
                <Icon name="collapse" size={16} />
              </button>
              <button type="button" className="adm-icon-btn adm-menu-btn" onClick={() => setDrawerOpen(false)} aria-label="Close menu"><Icon name="x" /></button>
            </div>
            <nav className="adm-nav" aria-label="Admin sections">
              {NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => !item.permission || can(user?.role, item.permission)) })).filter((group) => group.items.length > 0).map((group) => (
                <div key={group.label ?? "root"} role="group" aria-label={group.label ?? undefined}>
                  {group.label ? <div className="adm-nav-group">{group.label}</div> : null}
                  {group.items.map((item) => {
                    const active = isNavActive(pathname, item);
                    return (
                      <Link key={item.href} href={item.href} className="adm-nav-link" aria-current={active ? "page" : undefined} title={collapsed ? item.label : undefined}>
                        <Icon name={item.icon} />
                        <span className="adm-nav-label">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
            <div className="adm-sidebar-foot">
              {user ? (
                <Link href="/admin/account" className="adm-nav-link adm-user" aria-current={pathname.startsWith("/admin/account") ? "page" : undefined} title={collapsed ? `${user.name} (${ROLE_LABELS[user.role].label})` : undefined}>
                  <Icon name="user" />
                  <span className="adm-nav-label adm-user-text"><strong>{user.name}</strong><small>{user.kind === "legacy" ? "Shared password" : ROLE_LABELS[user.role].label}</small></span>
                </Link>
              ) : null}
              <a className="adm-nav-link" href="https://streetdotcom.com" target="_blank" rel="noopener noreferrer" title={collapsed ? "Visit site" : undefined}>
                <Icon name="external" /><span className="adm-nav-label">Visit site</span>
              </a>
              <form action={logout}>
                <button type="submit" className="adm-nav-link" title={collapsed ? "Log out" : undefined}>
                  <Icon name="logout" /><span className="adm-nav-label">Log out</span>
                </button>
              </form>
            </div>
          </aside>
          {drawerOpen ? <div className="adm-drawer-scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" /> : null}

          <div className="adm-col">
            <header className="adm-topbar">
              <button type="button" className="adm-icon-btn adm-menu-btn" onClick={() => setDrawerOpen(true)} aria-label="Open menu" aria-expanded={drawerOpen}><Icon name="menu" /></button>
              <div className="adm-topbar-grow">
                <button type="button" className="adm-search-btn" onClick={() => setPaletteOpen(true)} aria-label="Search the admin (Ctrl K)">
                  <Icon name="search" size={16} />
                  <span>Search pages, brands, products…</span>
                  <kbd>Ctrl K</kbd>
                </button>
                {isRangeAwarePath(pathname) ? <Suspense fallback={null}><DateRangePicker timeZone={timeZone} /></Suspense> : null}
              </div>
              <div className="adm-topbar-actions">
                {bell}
                <button type="button" className="adm-icon-btn" onClick={cycleTheme} aria-label="Switch between light and dark theme" title="Switch theme">
                  <Icon name={effectiveDark ? "sun" : "moon"} />
                </button>
              </div>
            </header>
            <main id="admin-main" className="adm-content" tabIndex={-1}>{children}</main>
          </div>
        </div>
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        <Suspense fallback={null}><UrlToast /></Suspense>
      </ToastProvider>
    </div>
  );
}
