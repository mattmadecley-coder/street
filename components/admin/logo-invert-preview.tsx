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
    <div className="u-row-12 u-my-12">
      <div className="adm-logo-box" data-invert={invert ? "true" : "false"}>
        {src ? (
          <img src={src} alt="Logo preview" />
        ) : (
          <span className="adm-logo-empty">No preview yet</span>
        )}
      </div>
      <label className="adm-check-label">
        <input type="checkbox" name={name} checked={invert} onChange={(event) => setInvert(event.target.checked)} />
        Invert this logo (white/light logo → black, so it shows up on our background)
      </label>
    </div>
  );
}
