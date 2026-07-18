"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const VISITOR_KEY = "street-visitor-v1";
const SESSION_KEY = "street-session-v1";
const ATTRIBUTION_KEY = "street-attribution-v1";
const DISABLED_KEY = "street-analytics-disabled";
const SESSION_TIMEOUT_MS = 30 * 60_000;

type SessionState = { id: string; startedAt: number; lastActivityAt: number; sequence: number; landingPath: string };
type Attribution = { referrer: string | null; utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; utmContent: string | null; utmTerm: string | null };

function randomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function cookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function readJson<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") as T | null; } catch { return null; }
}

function trackingDisabled() {
  if (typeof window === "undefined") return true;
  if (localStorage.getItem(DISABLED_KEY) === "true") return true;
  if (location.hostname.endsWith(".vercel.app") || location.hostname === "localhost" || location.hostname === "127.0.0.1") return true;
  const ua = navigator.userAgent.toLowerCase();
  return navigator.webdriver || /bot|crawler|spider|headless|lighthouse|pagespeed/.test(ua);
}

function deviceType() {
  const width = window.innerWidth;
  if (width <= 767) return "mobile";
  if (width <= 1024) return "tablet";
  return "desktop";
}

function browserName() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "Safari";
  if (/Firefox\//.test(ua)) return "Firefox";
  return "Other";
}

function operatingSystem() {
  const ua = navigator.userAgent;
  if (/Windows/.test(ua)) return "Windows";
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Other";
}

export async function trackStreetEvent(eventType: string, details: Record<string, unknown> = {}) {
  if (typeof window === "undefined" || trackingDisabled()) return;
  const now = Date.now();
  let visitorId = localStorage.getItem(VISITOR_KEY);
  if (!visitorId) {
    visitorId = randomId();
    localStorage.setItem(VISITOR_KEY, visitorId);
  }

  let session = readJson<SessionState>(SESSION_KEY);
  if (!session || now - session.lastActivityAt > SESSION_TIMEOUT_MS) {
    session = { id: randomId(), startedAt: now, lastActivityAt: now, sequence: 0, landingPath: `${location.pathname}${location.search}` };
  }
  session.lastActivityAt = now;
  session.sequence += 1;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));

  const params = new URLSearchParams(location.search);
  let attribution = readJson<Attribution>(ATTRIBUTION_KEY);
  if (!attribution) {
    attribution = {
      referrer: document.referrer || null,
      utmSource: params.get("utm_source"),
      utmMedium: params.get("utm_medium"),
      utmCampaign: params.get("utm_campaign"),
      utmContent: params.get("utm_content"),
      utmTerm: params.get("utm_term"),
    };
    localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution));
  }

  cookie("street_visitor_id", visitorId);
  cookie("street_session_id", session.id);
  cookie("street_attribution", JSON.stringify(attribution));

  const payload = {
    eventType,
    eventId: randomId(),
    anonymousUserId: visitorId,
    sessionId: session.id,
    eventSequence: session.sequence,
    path: `${location.pathname}${location.search}`,
    referrer: document.referrer || null,
    landingPath: session.landingPath,
    deviceType: deviceType(),
    browser: browserName(),
    operatingSystem: operatingSystem(),
    screenWidth: window.innerWidth,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    utmSource: attribution.utmSource,
    utmMedium: attribution.utmMedium,
    utmCampaign: attribution.utmCampaign,
    utmContent: attribution.utmContent,
    utmTerm: attribution.utmTerm,
    ...details,
  };

  try {
    await fetch("/api/analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), keepalive: true });
  } catch {}
}

export function AnalyticsTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastPath = useRef("");

  useEffect(() => {
    const current = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    if (current === lastPath.current || pathname.startsWith("/admin") || trackingDisabled()) return;
    lastPath.current = current;
    void trackStreetEvent("page_view");

    const product = document.querySelector<HTMLElement>("[data-analytics-product-view]");
    if (product) {
      const details = {
        productId: product.dataset.productId,
        brandSlug: product.dataset.brandSlug,
        streetGroup: product.dataset.streetGroup,
        streetCategory: product.dataset.streetCategory,
        price: product.dataset.price ? Number(product.dataset.price) : undefined,
        sourceComponent: "product_page",
      };
      void trackStreetEvent("product_view", details);
      if (product.dataset.searchQuery) void trackStreetEvent("search_click", { ...details, query: product.dataset.searchQuery, sourceComponent: "search_results" });
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    if (trackingDisabled()) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-analytics-event]") : null;
      if (!target) return;
      let metadata: Record<string, unknown> = {};
      try { metadata = target.dataset.analyticsMetadata ? JSON.parse(target.dataset.analyticsMetadata) : {}; } catch {}
      void trackStreetEvent(target.dataset.analyticsEvent ?? "click", {
        sourceComponent: target.dataset.analyticsComponent,
        position: target.dataset.analyticsPosition ? Number(target.dataset.analyticsPosition) : undefined,
        productId: target.dataset.analyticsProduct,
        brandSlug: target.dataset.analyticsBrand,
        query: target.dataset.analyticsQuery,
        metadata,
      });
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  useEffect(() => {
    if (trackingDisabled()) return;

    const handleWindowError = (event: ErrorEvent) => {
      void trackStreetEvent("javascript_error", { sourceComponent: "window", metadata: { message: event.message.slice(0, 500), filename: event.filename, line: event.lineno, column: event.colno } });
    };
    const handleUnhandled = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "Unknown rejection");
      void trackStreetEvent("unhandled_rejection", { sourceComponent: "window", metadata: { reason: reason.slice(0, 500) } });
    };
    const handleResourceError = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLImageElement) {
        void trackStreetEvent("broken_image", { sourceComponent: "image", metadata: { src: target.currentSrc || target.src, alt: target.alt } });
      }
    };
    const reportPerformance = () => {
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (!navigation) return;
      void trackStreetEvent("page_performance", {
        sourceComponent: "navigation",
        metadata: {
          domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd),
          loadMs: Math.round(navigation.loadEventEnd),
          responseMs: Math.round(navigation.responseEnd - navigation.requestStart),
          transferSize: navigation.transferSize,
        },
      });
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandled);
    document.addEventListener("error", handleResourceError, true);
    if (document.readyState === "complete") window.setTimeout(reportPerformance, 0);
    else window.addEventListener("load", reportPerformance, { once: true });

    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandled);
      document.removeEventListener("error", handleResourceError, true);
      window.removeEventListener("load", reportPerformance);
    };
  }, []);

  return null;
}
