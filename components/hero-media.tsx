"use client";

import { useState } from "react";
import { CatalogImage } from "@/components/catalog-image";
import { MEDIA_BLUR_DATA_URL } from "@/lib/media-placeholders";

// Every other image on the site routes through CatalogImage (ImageKit's
// proxy, or a direct pass-through fallback) instead of Next's own
// server-side image optimizer -- that optimizer 500/503'd under load on
// Render's free tier, and it isn't available at all on Cloudflare Workers
// without extra Images-product setup. The hero image was the one
// remaining place still using next/image directly; moved it onto the
// same pipeline as everything else so the whole app has zero dependency
// on Next's built-in optimizer.
export function HeroMedia({ videoUrl, imageUrl, className }: { videoUrl?: string; imageUrl?: string; className: string }) {
  const [videoFailed, setVideoFailed] = useState(false);

  return (
    <>
      {imageUrl ? (
        <CatalogImage
          className={className}
          src={imageUrl}
          widthHint={1920}
          alt="Street hero"
          fill
          preload
          fetchPriority="high"
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
