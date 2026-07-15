"use client";

import Image from "next/image";
import { useState } from "react";

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
        loading={priority ? undefined : "lazy"}
        quality={75}
        sizes="(max-width: 840px) 50vw, (max-width: 1280px) 33vw, 25vw"
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
          quality={75}
          sizes="(max-width: 840px) 50vw, (max-width: 1280px) 33vw, 25vw"
          className="card-image-secondary"
          style={{ objectFit: "contain" }}
        />
      ) : null}
    </div>
  );
}
