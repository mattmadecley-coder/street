"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { MEDIA_BLUR_DATA_URL } from "@/lib/media-placeholders";

export function HeroMedia({ videoUrl, imageUrl, className }: { videoUrl?: string; imageUrl?: string; className: string }) {
  const [videoReady, setVideoReady] = useState(false);
  const [loadVideo, setLoadVideo] = useState(false);

  useEffect(() => {
    if (!videoUrl) return;

    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (connection?.saveData || reducedMotion) return;

    // Let the optimized hero image and critical page resources win the first
    // network round. The video begins shortly after first paint instead of a
    // large MP4 competing with LCP immediately.
    const start = () => setLoadVideo(true);
    const idleWindow = window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (idleWindow.requestIdleCallback) {
      const id = idleWindow.requestIdleCallback(start, { timeout: 1_200 });
      return () => idleWindow.cancelIdleCallback?.(id);
    }

    const id = window.setTimeout(start, 450);
    return () => window.clearTimeout(id);
  }, [videoUrl]);

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
      {videoUrl && loadVideo ? (
        <video
          className={className}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          onCanPlay={() => setVideoReady(true)}
          onError={() => setVideoReady(false)}
          style={{ opacity: videoReady ? 1 : 0, transition: "opacity .18s ease" }}
        >
          <source src={videoUrl} type="video/mp4" />
        </video>
      ) : null}
    </>
  );
}
