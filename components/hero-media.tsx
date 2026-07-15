"use client";

import Image from "next/image";
import { useState } from "react";

export function HeroMedia({ videoUrl, imageUrl, className }: { videoUrl?: string; imageUrl?: string; className: string }) {
  const [videoReady, setVideoReady] = useState(false);

  if (videoUrl) {
    return (
      <video
        className={className}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster={imageUrl || undefined}
        onLoadedData={() => setVideoReady(true)}
        style={{ opacity: videoReady || imageUrl ? 1 : 0, transition: "opacity .18s ease" }}
      >
        <source src={videoUrl} type="video/mp4" />
      </video>
    );
  }

  if (imageUrl) {
    return (
      <Image
        className={className}
        src={imageUrl}
        alt="Street hero"
        fill
        priority
        fetchPriority="high"
        quality={78}
        sizes="100vw"
        style={{ objectFit: "cover", objectPosition: "center" }}
      />
    );
  }

  return null;
}
