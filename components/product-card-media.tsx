"use client";

import Image from "next/image";
import { useState } from "react";
import { MEDIA_BLUR_DATA_URL } from "@/lib/media-placeholders";

export function ProductCardMedia({
  primaryImage,
  secondImage,
  title,
  priority = false,
}: {
  primaryImage: string;
  secondImage?: string | null;
  title: string;
  priority?: boolean;
}) {
  const [loadAlternate, setLoadAlternate] = useState(false);

  if (!primaryImage) {
    return <div aria-hidden="true" style={{ position: "absolute", inset: 8, background: "#ebe9e3" }} />;
  }

  return (
    <div
      className="card-media-layer"
      style={{ position: "absolute", inset: 8 }}
      onPointerEnter={() => setLoadAlternate(true)}
      onFocusCapture={() => setLoadAlternate(true)}
    >
      <Image
        src={primaryImage}
        alt={title}
        fill
        preload={priority}
        fetchPriority={priority ? "high" : "auto"}
        loading={priority ? undefined : "lazy"}
        quality={75}
        sizes="(max-width: 840px) 50vw, (max-width: 1280px) 33vw, 25vw"
        placeholder="blur"
        blurDataURL={MEDIA_BLUR_DATA_URL}
        className="card-image-primary"
        style={{ objectFit: "contain" }}
      />
      {secondImage && loadAlternate ? (
        <Image
          src={secondImage}
          alt=""
          aria-hidden
          fill
          loading="lazy"
          fetchPriority="low"
          quality={70}
          sizes="(max-width: 840px) 50vw, (max-width: 1280px) 33vw, 25vw"
          placeholder="blur"
          blurDataURL={MEDIA_BLUR_DATA_URL}
          className="card-image-secondary"
          style={{ objectFit: "contain" }}
        />
      ) : null}
    </div>
  );
}
