"use client";

import { useEffect, useRef, useState } from "react";

/** Only http(s) links and in-browser previews of a chosen file may be used as media sources. */
export function safeMediaUrl(value: string): string {
  const text = value.trim();
  return /^https?:\/\//i.test(text) || /^blob:/i.test(text) || /^data:image\//i.test(text) ? text : "";
}

type Values = { imageUrl: string; videoUrl: string; brandName: string; ctaLabel: string };

/**
 * A scaled-down picture of the homepage hero. With `formId`, it follows that form as you type,
 * pick a brand or choose an image file, so you see the change before publishing it.
 */
export function HomepagePreview({
  title,
  formId,
  initial,
  brandNames,
}: {
  title: string;
  formId?: string;
  initial: Values;
  /** slug -> display name, used to turn the brand dropdown's value into a name. */
  brandNames?: Record<string, string>;
}) {
  const [values, setValues] = useState<Values>(initial);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const fileUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!formId) return;
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;

    const read = () => {
      const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
      const slug = (field("featured_brand_slug") as HTMLSelectElement | null)?.value ?? "";
      setValues((current) => ({
        imageUrl: fileUrl.current ?? ((field("hero_image_url") as HTMLInputElement | null)?.value ?? current.imageUrl),
        videoUrl: (field("hero_video_url") as HTMLInputElement | null)?.value ?? current.videoUrl,
        brandName: brandNames?.[slug] ?? current.brandName,
        ctaLabel: (field("featured_brand_cta_label") as HTMLInputElement | null)?.value || current.ctaLabel,
      }));
    };
    const onFile = (event: Event) => {
      const input = event.target as HTMLInputElement;
      if (input.name !== "hero_image_file") return;
      if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
      const file = input.files?.[0];
      fileUrl.current = file ? URL.createObjectURL(file) : null;
      read();
    };

    form.addEventListener("input", read);
    form.addEventListener("change", read);
    form.addEventListener("change", onFile);
    return () => {
      form.removeEventListener("input", read);
      form.removeEventListener("change", read);
      form.removeEventListener("change", onFile);
      if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
    };
  }, [formId, brandNames]);

  const image = safeMediaUrl(values.imageUrl);
  const video = safeMediaUrl(values.videoUrl);

  return (
    <figure className="adm-hp" aria-label={title}>
      <figcaption className="adm-hp-head">
        <strong>{title}</strong>
        <span className="adm-hp-toggle" role="group" aria-label="Preview size">
          <button type="button" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}>Desktop</button>
          <button type="button" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}>Mobile</button>
        </span>
      </figcaption>
      <div className="adm-hp-frame" data-device={device}>
        {video ? <video key={video} src={video} muted loop playsInline autoPlay className="adm-hp-media" /> : image ? <img key={image} src={image} alt="" className="adm-hp-media" /> : <div className="adm-hp-media adm-hp-empty">No hero image or video set</div>}
        <div className="adm-hp-overlay">
          <p className="adm-hp-eyebrow">Featured brand</p>
          <p className="adm-hp-brand">{values.brandName || "—"}</p>
          <span className="adm-hp-cta">{values.ctaLabel || "Shop this brand"}</span>
        </div>
      </div>
      <p className="adm-hp-note">An approximation for checking images, brand and wording. Spacing on the real site may differ slightly.</p>
    </figure>
  );
}
