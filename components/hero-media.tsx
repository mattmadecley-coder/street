"use client";

import Image from "next/image";
import { useState } from "react";

export function HeroMedia({ videoUrl, imageUrl, className }: { videoUrl?: string; imageUrl?: string; className: string }) {
  const [videoReady, setVideoReady] = useState(false);

  return (
    <>
      {imageUrl ? (
        <Image
          className={className}
          src={imageUrl}
          alt="Street hero"
          fill
          preload
          quality={75}
          sizes="100vw"
          style={{ objectFit: "cover", objectPosition: "center" }}
        />
      ) : null}
      {videoUrl ? (
        <video
          className={className}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onLoadedData={() => setVideoReady(true)}
          style={{ opacity: videoReady ? 1 : 0, transition: "opacity .18s ease" }}
        >
          <source src={videoUrl} type="video/mp4" />
        </video>
      ) : null}
    </>
  );
}
