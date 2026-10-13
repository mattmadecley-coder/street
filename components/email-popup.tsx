"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { EmailPopupConfig } from "@/lib/email-popup-config";

const SUPPRESS_KEY = "street-email-popup-v1";
const PAGES_KEY = "street-popup-pages-v1";
const VISITOR_KEY = "street-visitor-v1";

type ViewProps = {
  config: EmailPopupConfig;
  step: 1 | 2 | 3;
  mobile?: boolean;
  email: string;
  phone: string;
  error?: string | null;
  busy?: boolean;
  onEmail: (value: string) => void;
  onPhone: (value: string) => void;
  onNext: () => void;
  onFinish: () => void;
  onSkip: () => void;
  onClose: () => void;
  /** Admin preview only: dragging the photo repositions the crop. */
  onImagePosition?: (x: number, y: number) => void;
};

/** Pure presentation, shared by the live storefront popup and the admin preview. */
export function EmailPopupView(props: ViewProps) {
  const { config, step, mobile, email, phone, error, busy } = props;
  const ink = config.accent;
  const [imageFailed, setImageFailed] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; w: number; h: number } | null>(null);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const validPhone = phone.replace(/\D/g, "").length >= 10;
  const primary = (enabled: boolean): React.CSSProperties => ({
    alignSelf: "flex-start", padding: "13px 28px", border: 0, background: enabled ? ink : "rgba(16,16,16,.3)", color: "#f4f3ee",
    font: "inherit", fontSize: 15, fontWeight: 600, cursor: enabled && !busy ? "pointer" : "not-allowed",
  });
  const input: React.CSSProperties = { padding: "13px 14px", border: `1px solid ${ink}`, background: "#fff", font: "inherit", fontSize: 16, marginBottom: 10, maxWidth: 380, boxSizing: "border-box", width: "100%" };
  const heading: React.CSSProperties = { margin: "0 0 8px", fontSize: mobile ? 26 : 34, lineHeight: 1.05, letterSpacing: "-.02em" };
  const body: React.CSSProperties = { margin: "0 0 16px", fontSize: 15, lineHeight: 1.45, maxWidth: 380 };
  const fine: React.CSSProperties = { margin: "14px 0 0", fontSize: 11, lineHeight: 1.4, opacity: 0.6, maxWidth: 380 };
  const link: React.CSSProperties = { alignSelf: "flex-start", marginTop: 12, border: 0, background: "none", font: "inherit", fontSize: 13, textDecoration: "underline", cursor: "pointer", color: "rgba(16,16,16,.6)", padding: 0 };

  return (
    <div role="dialog" aria-modal="true" aria-label="Join the Street email list"
      style={{ display: "flex", flexDirection: mobile ? "column" : "row", width: "100%", maxWidth: mobile ? 360 : 820, margin: "0 auto", background: "#f4f3ee", color: "#101010", boxShadow: "0 24px 70px rgba(0,0,0,.35)", position: "relative", overflow: "hidden" }}>
      <button type="button" aria-label="Close popup" onClick={props.onClose}
        style={{ position: "absolute", top: 10, right: 12, zIndex: 2, border: 0, background: "rgba(244,243,238,.9)", width: 30, height: 30, fontSize: 18, cursor: "pointer" }}>×</button>
      <div
        style={{ flex: mobile ? "none" : "0 0 46%", height: mobile ? 180 : "auto", minHeight: mobile ? 0 : 440, background: "#e4e2da", position: "relative", overflow: "hidden", cursor: props.onImagePosition ? "grab" : undefined, touchAction: props.onImagePosition ? "none" : undefined }}
        onPointerDown={props.onImagePosition ? (e) => {
          const box = e.currentTarget.getBoundingClientRect();
          drag.current = { x: e.clientX, y: e.clientY, ox: config.imageX, oy: config.imageY, w: box.width, h: box.height };
          e.currentTarget.setPointerCapture(e.pointerId);
        } : undefined}
        onPointerMove={props.onImagePosition ? (e) => {
          const d = drag.current;
          if (!d) return;
          // Dragging the photo right reveals more of its left side, so the focus point moves the opposite way.
          const clamp = (v: number) => Math.max(0, Math.min(100, v));
          props.onImagePosition?.(clamp(d.ox - ((e.clientX - d.x) / d.w) * 100), clamp(d.oy - ((e.clientY - d.y) / d.h) * 100));
        } : undefined}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
      >
        {config.image && !imageFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={config.image} alt="" draggable={false} onError={() => setImageFailed(true)}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: `${config.imageX}% ${config.imageY}%`, transform: config.imageZoom > 1 ? `scale(${config.imageZoom})` : undefined, transformOrigin: `${config.imageX}% ${config.imageY}%`, userSelect: "none", pointerEvents: "none" }} />
        ) : null}
      </div>
      <div style={{ flex: 1, padding: mobile ? "22px 22px 24px" : "40px 40px 32px", display: "flex", flexDirection: "column", justifyContent: "center", minHeight: mobile ? 0 : 440 }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".04em", marginBottom: 6 }}>{config.brandLine}</div>
        {step < 3 ? (
          <div style={{ display: "flex", gap: 6, marginBottom: 18 }} aria-label={`Step ${step} of 2`}>
            {[1, 2].map((n) => <span key={n} style={{ height: 3, width: 32, background: n <= step ? ink : "rgba(16,16,16,.18)" }} />)}
          </div>
        ) : null}

        {step === 1 ? (
          <form onSubmit={(e) => { e.preventDefault(); if (validEmail) props.onNext(); }} style={{ display: "flex", flexDirection: "column" }}>
            <h3 style={heading}>{config.step1Title}</h3>
            <p style={body}>{config.step1Body}</p>
            <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => props.onEmail(e.target.value)} placeholder={config.emailPlaceholder} aria-label="Email address" style={input} />
            {/* Honeypot: hidden from people, bots fill it. */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
            {error ? <p role="alert" style={{ margin: "0 0 10px", fontSize: 13, color: "#b3261e" }}>{error}</p> : null}
            <button type="submit" disabled={!validEmail || busy} style={primary(validEmail)}>{busy ? "Saving…" : config.step1Button}</button>
            <button type="button" onClick={props.onClose} style={link}>{config.skipLabel}</button>
            <p style={fine}>{config.fineprint}</p>
          </form>
        ) : null}

        {step === 2 ? (
          <form onSubmit={(e) => { e.preventDefault(); if (validPhone) props.onFinish(); }} style={{ display: "flex", flexDirection: "column" }}>
            <h3 style={heading}>{config.step2Title}</h3>
            <p style={body}>{config.step2Body}</p>
            <input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => props.onPhone(e.target.value)} placeholder={config.phonePlaceholder} aria-label="Phone number" style={input} />
            {error ? <p role="alert" style={{ margin: "0 0 10px", fontSize: 13, color: "#b3261e" }}>{error}</p> : null}
            <button type="submit" disabled={!validPhone || busy} style={primary(validPhone)}>{busy ? "Saving…" : config.step2Button}</button>
            <button type="button" onClick={props.onSkip} style={link}>{config.skipLabel}</button>
            <p style={fine}>{config.smsFineprint}</p>
          </form>
        ) : null}

        {step === 3 ? (
          <>
            <h3 style={heading}>{config.doneTitle}</h3>
            <p style={body}>{config.doneBody}</p>
            <button type="button" onClick={props.onClose} style={primary(true)}>Keep browsing</button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function visitorId() {
  try {
    const raw = window.localStorage.getItem(VISITOR_KEY);
    return raw ? raw.replace(/^"|"$/g, "") : null;
  } catch {
    return null;
  }
}

function track(type: string, pagePath: string) {
  try {
    const payload = JSON.stringify({ type, anonymousId: visitorId(), pagePath });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/email/popup-event", new Blob([payload], { type: "application/json" }));
    else void fetch("/api/email/popup-event", { method: "POST", headers: { "content-type": "application/json" }, body: payload, keepalive: true });
  } catch { /* tracking must never break the page */ }
}

function suppress(days: number) {
  try { window.localStorage.setItem(SUPPRESS_KEY, String(Date.now() + days * 86_400_000)); } catch { /* ignore */ }
}

export function EmailPopup({ config }: { config: EmailPopupConfig }) {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mobile, setMobile] = useState(false);
  const token = useRef<string | null>(null);
  const shown = useRef(false);
  const pages = useRef(0);
  const ready = useRef(false);

  const blocked = useCallback(() => {
    if (!config.enabled || shown.current) return true;
    if (pathname.startsWith("/admin") || pathname.startsWith("/checkout") || pathname.startsWith("/cart")) return true;
    if (!config.showOnMobile && window.innerWidth < 700) return true;
    if (/bot|crawl|spider|headless/i.test(navigator.userAgent)) return true;
    try {
      const until = Number(window.localStorage.getItem(SUPPRESS_KEY) ?? 0);
      if (until > Date.now()) return true;
    } catch { /* ignore */ }
    return false;
  }, [config, pathname]);

  const tryShow = useCallback(() => {
    if (!ready.current || pages.current < config.minPages || blocked()) return;
    shown.current = true;
    setMobile(window.innerWidth < 700);
    setOpen(true);
    track("shown", window.location.pathname);
  }, [blocked, config.minPages]);

  // Count pages seen this session.
  useEffect(() => {
    try {
      const count = Number(window.sessionStorage.getItem(PAGES_KEY) ?? 0) + 1;
      window.sessionStorage.setItem(PAGES_KEY, String(count));
      pages.current = count;
    } catch { pages.current = config.minPages; }
    tryShow();
  }, [pathname, config.minPages, tryShow]);

  // Wait out the delay once per page load.
  useEffect(() => {
    if (!config.enabled) return;
    const timer = window.setTimeout(() => { ready.current = true; tryShow(); }, config.delaySeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [config.enabled, config.delaySeconds, tryShow]);

  async function submitEmail() {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams(window.location.search);
      const honeypot = (document.querySelector('input[name="website"]') as HTMLInputElement | null)?.value;
      const res = await fetch("/api/email/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email, website: honeypot, anonymousId: visitorId(), source: "popup", pagePath: window.location.pathname,
          utmSource: params.get("utm_source"), utmMedium: params.get("utm_medium"), utmCampaign: params.get("utm_campaign"), referrer: document.referrer || null,
        }),
      });
      const data = (await res.json()) as { ok: boolean; token?: string | null; error?: string };
      if (!data.ok) { setError(data.error ?? "Something went wrong."); track("email_error", window.location.pathname); return; }
      token.current = data.token ?? null;
      suppress(365);
      track("email_submitted", window.location.pathname);
      setStep(2);
    } catch {
      setError("Couldn't reach us. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPhone() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/email/phone", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: token.current, phone }) });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) { setError(data.error ?? "Something went wrong."); track("phone_error", window.location.pathname); return; }
      track("phone_submitted", window.location.pathname);
      setStep(3);
    } catch {
      setError("Couldn't reach us. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (step === 1) { suppress(config.suppressDays); track("closed_email_step", window.location.pathname); }
    if (step === 2) track("closed_phone_step", window.location.pathname);
    setOpen(false);
  }

  // "Started" = first keystroke, so the funnel shows who engaged with a field but never finished it.
  const started = useRef({ email: false, phone: false });
  function changeEmail(value: string) {
    if (!started.current.email && value) { started.current.email = true; track("email_started", window.location.pathname); }
    setEmail(value);
  }
  function changePhone(value: string) {
    if (!started.current.phone && value) { started.current.phone = true; track("phone_started", window.location.pathname); }
    setPhone(value);
  }

  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(16,16,16,.55)", display: "grid", placeItems: "center", padding: 16, overflowY: "auto" }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <EmailPopupView
        config={config} step={step} mobile={mobile} email={email} phone={phone} error={error} busy={busy}
        onEmail={changeEmail} onPhone={changePhone} onNext={submitEmail} onFinish={submitPhone}
        onSkip={() => { track("skipped_phone", window.location.pathname); setStep(3); }}
        onClose={close}
      />
    </div>
  );
}
