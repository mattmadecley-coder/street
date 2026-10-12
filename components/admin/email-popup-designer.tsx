"use client";

import { useEffect, useState } from "react";
import { EmailPopupView } from "@/components/email-popup";
import { EMAIL_POPUP_DEFAULTS, mergePopupConfig, type EmailPopupConfig } from "@/lib/email-popup-config";
import { publishPopupAction } from "@/app/admin/email/actions";

const OLD_STORAGE_KEY = "street-email-popup-mockup-v1";

const field: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid rgba(16,16,16,.25)", background: "#fff", font: "inherit", fontSize: 14, boxSizing: "border-box" };
const label: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, margin: "12px 0 4px" };

type TextKey = {
  [K in keyof EmailPopupConfig]: EmailPopupConfig[K] extends string ? K : never;
}[keyof EmailPopupConfig];

const TEXT_FIELDS: { key: TextKey; label: string; long?: boolean }[] = [
  { key: "image", label: "Image URL" },
  { key: "brandLine", label: "Brand line" },
  { key: "step1Title", label: "Step 1 title (email)" },
  { key: "step1Body", label: "Step 1 text", long: true },
  { key: "emailPlaceholder", label: "Email placeholder" },
  { key: "step1Button", label: "Step 1 button" },
  { key: "step2Title", label: "Step 2 title (phone)" },
  { key: "step2Body", label: "Step 2 text", long: true },
  { key: "phonePlaceholder", label: "Phone placeholder" },
  { key: "step2Button", label: "Step 2 button" },
  { key: "skipLabel", label: "Skip / close link" },
  { key: "fineprint", label: "Email fine print", long: true },
  { key: "smsFineprint", label: "Text-message fine print", long: true },
  { key: "doneTitle", label: "Done title" },
  { key: "doneBody", label: "Done text", long: true },
];

export function EmailPopupDesigner({ initial }: { initial: EmailPopupConfig }) {
  const [config, setConfig] = useState<EmailPopupConfig>(initial);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mobile, setMobile] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [importable, setImportable] = useState<Partial<EmailPopupConfig> | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(OLD_STORAGE_KEY);
      if (saved) setImportable(JSON.parse(saved) as Partial<EmailPopupConfig>);
    } catch { /* ignore */ }
  }, []);

  function update<K extends keyof EmailPopupConfig>(key: K, value: EmailPopupConfig[K]) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  function importOld() {
    if (!importable) return;
    // Keep Matthew's wording from the old mockup; step 2 is now the phone step so only shared fields come across.
    const { image, brandLine, step1Title, step1Body, emailPlaceholder, fineprint, doneTitle, doneBody, delaySeconds, minPages, showOnMobile, suppressDays, accent } = importable;
    setConfig((current) => mergePopupConfig({ ...current, image, brandLine, step1Title, step1Body, emailPlaceholder, fineprint, doneTitle, doneBody, delaySeconds, minPages, showOnMobile, suppressDays, accent }));
    setImportable(null);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 360px) minmax(0, 1fr)", gap: 28, alignItems: "start" }}>
      <form action={publishPopupAction}>
        <input type="hidden" name="config" value={JSON.stringify(config)} />
        <label style={{ ...label, display: "flex", gap: 8, alignItems: "center", marginTop: 0 }}>
          <input type="checkbox" checked={config.enabled} onChange={(e) => update("enabled", e.target.checked)} />
          Show this popup on the live site
        </label>
        {importable ? (
          <p style={{ fontSize: 12, margin: "8px 0" }}>
            Your earlier mockup edits are saved in this browser. <button type="button" onClick={importOld} style={{ border: 0, background: "none", textDecoration: "underline", cursor: "pointer", font: "inherit", padding: 0 }}>Load them</button>
          </p>
        ) : null}
        {TEXT_FIELDS.map((item) => (
          <div key={item.key}>
            <label style={label} htmlFor={`pf-${item.key}`}>{item.label}</label>
            {item.long ? (
              <textarea id={`pf-${item.key}`} rows={3} style={field} value={config[item.key]} onChange={(e) => update(item.key, e.target.value)} />
            ) : (
              <input id={`pf-${item.key}`} style={field} value={config[item.key]} onChange={(e) => update(item.key, e.target.value)} />
            )}
          </div>
        ))}
        <label style={label} htmlFor="pf-delay">Wait before showing (seconds)</label>
        <input id="pf-delay" type="number" min={0} style={field} value={config.delaySeconds} onChange={(e) => update("delaySeconds", Number(e.target.value))} />
        <label style={label} htmlFor="pf-pages">Pages visited first</label>
        <input id="pf-pages" type="number" min={1} style={field} value={config.minPages} onChange={(e) => update("minPages", Number(e.target.value))} />
        <label style={label} htmlFor="pf-days">Hide for this many days after closing</label>
        <input id="pf-days" type="number" min={0} style={field} value={config.suppressDays} onChange={(e) => update("suppressDays", Number(e.target.value))} />
        <label style={label} htmlFor="pf-accent">Accent color</label>
        <input id="pf-accent" type="color" value={config.accent} onChange={(e) => update("accent", e.target.value)} style={{ ...field, height: 38, padding: 2 }} />
        <label style={{ ...label, display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={config.showOnMobile} onChange={(e) => update("showOnMobile", e.target.checked)} /> Show on phones
        </label>
        <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
          <button type="submit" style={{ padding: "11px 22px", border: 0, background: "#101010", color: "#fff", font: "inherit", fontWeight: 700, cursor: "pointer" }}>Publish</button>
          <button type="button" onClick={() => setConfig(EMAIL_POPUP_DEFAULTS)} style={{ padding: "11px 18px", border: "1px solid rgba(16,16,16,.3)", background: "none", font: "inherit", cursor: "pointer" }}>Reset to defaults</button>
        </div>
      </form>

      <div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {([1, 2, 3] as const).map((n) => (
            <button key={n} type="button" onClick={() => setStep(n)} style={{ padding: "6px 12px", border: "1px solid #101010", background: step === n ? "#101010" : "none", color: step === n ? "#fff" : "#101010", font: "inherit", fontSize: 12, cursor: "pointer" }}>
              {n === 1 ? "Email step" : n === 2 ? "Phone step" : "Done"}
            </button>
          ))}
          <button type="button" onClick={() => setMobile((m) => !m)} style={{ padding: "6px 12px", border: "1px solid rgba(16,16,16,.3)", background: "none", font: "inherit", fontSize: 12, cursor: "pointer" }}>
            {mobile ? "Desktop preview" : "Phone preview"}
          </button>
        </div>
        <div style={{ background: "rgba(16,16,16,.55)", padding: 24 }}>
          <EmailPopupView
            config={config} step={step} mobile={mobile} email={email} phone={phone}
            onEmail={setEmail} onPhone={setPhone} onNext={() => setStep(2)} onFinish={() => setStep(3)} onSkip={() => setStep(3)} onClose={() => setStep(1)}
          />
        </div>
        <p style={{ fontSize: 12, opacity: 0.65, marginTop: 8 }}>Preview only. Nothing is saved from here until a real visitor uses the live popup.</p>
      </div>
    </div>
  );
}
