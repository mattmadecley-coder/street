"use client";

import { useEffect, useState } from "react";

/**
 * Live logo preview + "invert this logo" checkbox, used everywhere an admin
 * sets a brand's logo (onboarding's logo step, and the existing-brand edit
 * form). Watches a sibling logo_url text input and/or logo_file file input
 * by id (when given) so the preview updates as the admin types a URL or
 * picks a file, without needing to submit the form first.
 */
export function LogoInvertPreview({
  name = "logo_invert",
  initialSrc,
  watchUrlInputId,
  watchFileInputId,
  defaultChecked = false,
}: {
  name?: string;
  initialSrc?: string | null;
  watchUrlInputId?: string;
  watchFileInputId?: string;
  defaultChecked?: boolean;
}) {
  const [src, setSrc] = useState<string | null>(initialSrc ?? null);
  const [invert, setInvert] = useState(defaultChecked);

  useEffect(() => {
    if (!watchUrlInputId) return;
    const el = document.getElementById(watchUrlInputId) as HTMLInputElement | null;
    if (!el) return;
    const handler = () => {
      if (el.value.trim()) setSrc(el.value.trim());
    };
    el.addEventListener("input", handler);
    return () => el.removeEventListener("input", handler);
  }, [watchUrlInputId]);

  useEffect(() => {
    if (!watchFileInputId) return;
    const el = document.getElementById(watchFileInputId) as HTMLInputElement | null;
    if (!el) return;
    const handler = () => {
      const file = el.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") setSrc(reader.result);
      };
      reader.readAsDataURL(file);
    };
    el.addEventListener("change", handler);
    return () => el.removeEventListener("change", handler);
  }, [watchFileInputId]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "12px 0" }}>
      <div style={{ width: 140, height: 60, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(16,16,16,.16)", background: invert ? "#101010" : "#fafaf8", flexShrink: 0 }}>
        {src ? (
          <img src={src} alt="Logo preview" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", filter: invert ? "invert(1)" : undefined }} />
        ) : (
          <span style={{ fontSize: 10, color: "rgba(16,16,16,.4)" }}>No preview yet</span>
        )}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
        <input type="checkbox" name={name} checked={invert} onChange={(event) => setInvert(event.target.checked)} />
        Invert this logo (white/light logo → black, so it shows up on our background)
      </label>
    </div>
  );
}
