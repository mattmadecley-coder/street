"use client";

import { useEffect, useState } from "react";

type Config = {
  image: string;
  brandLine: string;
  step1Title: string;
  step1Body: string;
  interests: string;
  step1Button: string;
  step2Title: string;
  step2Body: string;
  emailPlaceholder: string;
  step2Button: string;
  fineprint: string;
  doneTitle: string;
  doneBody: string;
  delaySeconds: number;
  minPages: number;
  showOnMobile: boolean;
  suppressDays: number;
  accent: string;
};

const DEFAULTS: Config = {
  image: "https://cdn.shopify.com/s/files/1/0001/8192/7990/files/BLACKISLANDKNOCKOUTTRACKSUITFRONT_f10bfaca-e672-423d-9a4e-7fd64e7f132e.png?v=1784840211",
  brandLine: "Street",
  step1Title: "Be the first to know.",
  step1Body: "New pieces from independent brands drop and sell out fast. Tell us what you wear and we'll tell you first.",
  interests: "Menswear, Womenswear, Footwear, Accessories, Bags",
  step1Button: "Next",
  step2Title: "Where should we send it?",
  step2Body: "One email when something you'd want goes live. No spam, unsubscribe any time.",
  emailPlaceholder: "you@email.com",
  step2Button: "Get early access",
  fineprint: "By signing up you agree to get emails from Street.",
  doneTitle: "You're on the list.",
  doneBody: "We'll email you the moment new pieces drop. Keep browsing in the meantime.",
  delaySeconds: 20,
  minPages: 2,
  showOnMobile: true,
  suppressDays: 14,
  accent: "#101010",
};

const STORAGE_KEY = "street-email-popup-mockup-v1";

const field: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid rgba(16,16,16,.25)", background: "#fff", font: "inherit", fontSize: 14, boxSizing: "border-box" };
const label: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, margin: "12px 0 4px" };

export function EmailPopupDesigner() {
  const [config, setConfig] = useState<Config>(DEFAULTS);
  const [step, setStep] = useState(1);
  const [picked, setPicked] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setConfig({ ...DEFAULTS, ...(JSON.parse(saved) as Partial<Config>) });
    } catch {
      /* storage unavailable: defaults are fine */
    }
  }, []);

  function update<K extends keyof Config>(key: K, value: Config[K]) {
    setConfig((current) => {
      const next = { ...current, [key]: value };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    if (key === "image") setImageFailed(false);
  }

  function reset() {
    setConfig(DEFAULTS);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  const interests = config.interests.split(",").map((value) => value.trim()).filter(Boolean);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const ink = config.accent;

  const popup = (
    <div style={{ display: "flex", flexDirection: mobile ? "column" : "row", width: "100%", maxWidth: mobile ? 360 : 820, margin: "0 auto", background: "#f4f3ee", color: "#101010", boxShadow: "0 24px 70px rgba(0,0,0,.35)", position: "relative", overflow: "hidden" }}>
      <button type="button" aria-label="Close popup" style={{ position: "absolute", top: 10, right: 12, zIndex: 2, border: 0, background: "rgba(244,243,238,.9)", width: 30, height: 30, fontSize: 18, cursor: "pointer" }}>×</button>
      <div style={{ flex: mobile ? "none" : "0 0 46%", height: mobile ? 180 : "auto", minHeight: mobile ? 0 : 440, background: "#e4e2da", position: "relative" }}>
        {config.image && !imageFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={config.image} alt="" onError={() => setImageFailed(true)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 13, opacity: 0.55, padding: 20, textAlign: "center" }}>Add an image URL on the left</div>
        )}
      </div>
      <div style={{ flex: 1, padding: mobile ? "22px 22px 24px" : "40px 40px 32px", display: "flex", flexDirection: "column", justifyContent: "center", minHeight: mobile ? 0 : 440 }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".04em", marginBottom: 6 }}>{config.brandLine}</div>
        {step < 3 ? (
          <div style={{ display: "flex", gap: 6, marginBottom: 18 }} aria-label={`Step ${step} of 2`}>
            {[1, 2].map((n) => <span key={n} style={{ height: 3, width: 32, background: n <= step ? ink : "rgba(16,16,16,.18)" }} />)}
          </div>
        ) : null}

        {step === 1 ? (
          <>
            <h3 style={{ margin: "0 0 8px", fontSize: mobile ? 26 : 34, lineHeight: 1.05, letterSpacing: "-.02em" }}>{config.step1Title}</h3>
            <p style={{ margin: "0 0 16px", fontSize: 15, lineHeight: 1.45, maxWidth: 380 }}>{config.step1Body}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              {interests.map((item) => {
                const on = picked.includes(item);
                return (
                  <button key={item} type="button" onClick={() => setPicked((current) => (on ? current.filter((value) => value !== item) : [...current, item]))}
                    style={{ padding: "9px 14px", border: `1px solid ${ink}`, background: on ? ink : "transparent", color: on ? "#f4f3ee" : ink, font: "inherit", fontSize: 14, cursor: "pointer" }}>
                    {item}
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={() => setStep(2)} style={{ alignSelf: "flex-start", padding: "13px 28px", border: 0, background: ink, color: "#f4f3ee", font: "inherit", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>{config.step1Button}</button>
            <button type="button" style={{ alignSelf: "flex-start", marginTop: 12, border: 0, background: "none", font: "inherit", fontSize: 13, textDecoration: "underline", cursor: "pointer", color: "rgba(16,16,16,.6)", padding: 0 }}>No thanks</button>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <h3 style={{ margin: "0 0 8px", fontSize: mobile ? 26 : 34, lineHeight: 1.05, letterSpacing: "-.02em" }}>{config.step2Title}</h3>
            <p style={{ margin: "0 0 16px", fontSize: 15, lineHeight: 1.45, maxWidth: 380 }}>{config.step2Body}</p>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={config.emailPlaceholder} aria-label="Email address"
              style={{ padding: "13px 14px", border: `1px solid ${ink}`, background: "#fff", font: "inherit", fontSize: 15, marginBottom: 10, maxWidth: 380, boxSizing: "border-box", width: "100%" }} />
            <button type="button" disabled={!validEmail} onClick={() => setStep(3)} style={{ alignSelf: "flex-start", padding: "13px 28px", border: 0, background: validEmail ? ink : "rgba(16,16,16,.3)", color: "#f4f3ee", font: "inherit", fontSize: 15, fontWeight: 600, cursor: validEmail ? "pointer" : "not-allowed" }}>{config.step2Button}</button>
            <p style={{ margin: "12px 0 0", fontSize: 12, color: "rgba(16,16,16,.6)", maxWidth: 380 }}>{config.fineprint}</p>
            <button type="button" onClick={() => setStep(1)} style={{ alignSelf: "flex-start", marginTop: 8, border: 0, background: "none", font: "inherit", fontSize: 13, textDecoration: "underline", cursor: "pointer", color: "rgba(16,16,16,.6)", padding: 0 }}>Back</button>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <h3 style={{ margin: "0 0 8px", fontSize: mobile ? 26 : 34, lineHeight: 1.05, letterSpacing: "-.02em" }}>{config.doneTitle}</h3>
            <p style={{ margin: "0 0 20px", fontSize: 15, lineHeight: 1.45, maxWidth: 380 }}>{config.doneBody}</p>
            <button type="button" onClick={() => setStep(1)} style={{ alignSelf: "flex-start", padding: "13px 28px", border: `1px solid ${ink}`, background: "transparent", color: ink, font: "inherit", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Keep browsing</button>
          </>
        ) : null}
      </div>
    </div>
  );

  const text = (key: keyof Config, name: string, long = false) => (
    <div key={key}>
      <label style={label} htmlFor={`pop-${key}`}>{name}</label>
      {long
        ? <textarea id={`pop-${key}`} rows={3} value={String(config[key])} onChange={(event) => update(key, event.target.value as never)} style={{ ...field, resize: "vertical" }} />
        : <input id={`pop-${key}`} value={String(config[key])} onChange={(event) => update(key, event.target.value as never)} style={field} />}
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 24, alignItems: "start" }}>
      <div style={{ background: "#fff", border: "1px solid rgba(16,16,16,.14)", padding: "4px 18px 20px" }}>
        <h3 style={{ margin: "14px 0 0", fontSize: 16 }}>Edit the popup</h3>
        <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.65 }}>Changes show on the right instantly and are kept in this browser. This is a mockup: it doesn&apos;t collect emails yet.</p>
        {text("image", "Image URL (left side)")}
        {text("brandLine", "Small brand line")}
        <h4 style={{ margin: "18px 0 0", fontSize: 14 }}>Step 1: interests</h4>
        {text("step1Title", "Headline")}
        {text("step1Body", "Text", true)}
        {text("interests", "Choices (comma separated)")}
        {text("step1Button", "Button")}
        <h4 style={{ margin: "18px 0 0", fontSize: 14 }}>Step 2: email</h4>
        {text("step2Title", "Headline")}
        {text("step2Body", "Text", true)}
        {text("emailPlaceholder", "Email placeholder")}
        {text("step2Button", "Button")}
        {text("fineprint", "Fine print")}
        <h4 style={{ margin: "18px 0 0", fontSize: 14 }}>Step 3: thank you</h4>
        {text("doneTitle", "Headline")}
        {text("doneBody", "Text", true)}
        <h4 style={{ margin: "18px 0 0", fontSize: 14 }}>When it shows (for later)</h4>
        <label style={label} htmlFor="pop-delay">Wait this many seconds on the page: {config.delaySeconds}</label>
        <input id="pop-delay" type="range" min={0} max={90} value={config.delaySeconds} onChange={(event) => update("delaySeconds", Number(event.target.value))} style={{ width: "100%" }} />
        <label style={label} htmlFor="pop-pages">Only after this many pages viewed: {config.minPages}</label>
        <input id="pop-pages" type="range" min={1} max={6} value={config.minPages} onChange={(event) => update("minPages", Number(event.target.value))} style={{ width: "100%" }} />
        <label style={label} htmlFor="pop-days">After someone closes it, wait this many days: {config.suppressDays}</label>
        <input id="pop-days" type="range" min={1} max={60} value={config.suppressDays} onChange={(event) => update("suppressDays", Number(event.target.value))} style={{ width: "100%" }} />
        <label style={{ ...label, display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={config.showOnMobile} onChange={(event) => update("showOnMobile", event.target.checked)} /> Show on phones</label>
        <label style={label} htmlFor="pop-accent">Button / accent color</label>
        <input id="pop-accent" type="color" value={config.accent} onChange={(event) => update("accent", event.target.value)} />
        <div style={{ marginTop: 18 }}><button type="button" onClick={reset} style={{ ...field, width: "auto", cursor: "pointer" }}>Reset to defaults</button></div>
      </div>

      <div style={{ position: "sticky", top: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
          {[1, 2, 3].map((n) => (
            <button key={n} type="button" onClick={() => setStep(n)} style={{ ...field, width: "auto", cursor: "pointer", fontWeight: step === n ? 700 : 400, background: step === n ? "#101010" : "#fff", color: step === n ? "#fff" : "#101010" }}>Step {n}</button>
          ))}
          <span style={{ flex: 1 }} />
          <button type="button" onClick={() => setMobile(false)} style={{ ...field, width: "auto", cursor: "pointer", fontWeight: !mobile ? 700 : 400 }}>Desktop</button>
          <button type="button" onClick={() => setMobile(true)} style={{ ...field, width: "auto", cursor: "pointer", fontWeight: mobile ? 700 : 400 }}>Phone</button>
        </div>
        <div style={{ background: "rgba(16,16,16,.55)", padding: mobile ? "28px 12px" : "36px 24px" }}>{popup}</div>
        <p style={{ fontSize: 12, opacity: 0.65, margin: "8px 0 0" }}>Click through it like a visitor would. Shows after {config.delaySeconds}s and {config.minPages} pages, hidden for {config.suppressDays} days once closed{config.showOnMobile ? "" : ", desktop only"}.</p>
      </div>
    </div>
  );
}
