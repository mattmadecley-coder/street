"use client";

import Image from "next/image";
import { useState } from "react";
import { MEDIA_BLUR_DATA_URL } from "@/lib/media-placeholders";

export function HeroMedia({ videoUrl, imageUrl, className }: { videoUrl?: string; imageUrl?: string; className: string }) {
  const [videoFailed, setVideoFailed] = useState(false);

  return (
    <>
      {imageUrl ? (
        <Image
          className={className}
          src={imageUrl}
          alt="Street hero"
          fill
          preload
          fetchPriority="high"
          quality={80}
          sizes="100vw"
          placeholder="blur"
          blurDataURL={MEDIA_BLUR_DATA_URL}
          style={{ objectFit: "cover", objectPosition: "center" }}
        />
      ) : null}
      {videoUrl && !videoFailed ? (
        <video
          className={className}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster={imageUrl}
          onError={() => setVideoFailed(true)}
        >
          <source src={videoUrl} type="video/mp4" />
        </video>
      ) : null}
    </>
  );
}
