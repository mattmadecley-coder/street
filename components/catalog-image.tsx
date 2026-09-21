"use client";

import Image, { type ImageProps } from "next/image";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { catalogImageCandidates } from "@/lib/catalog-image";

type CatalogImageProps = Omit<ImageProps, "src" | "unoptimized" | "onError"> & {
  src: string;
  widthHint: number;
  fallbackSrcs?: Array<string | null | undefined>;
  fallback?: ReactNode;
};

/**
 * Loads remote catalog media through Next's built-in image optimizer, which
 * runs server-side on Render (no per-image billing like Vercel's optimizer had)
 * and gives us real AVIF/WebP negotiation plus a responsive srcset generated
 * from next.config's deviceSizes/imageSizes. Failed resized Shopify URLs fall
 * back to the original asset, then to any supplied alternate images.
 */
export function CatalogImage({
  src,
  widthHint,
  fallbackSrcs = [],
  fallback = null,
  ...imageProps
}: CatalogImageProps) {
  const sourceKey = [src, ...fallbackSrcs.filter(Boolean)].join("\n");
  const candidates = useMemo(() => {
    const unique = new Set<string>();
    for (const source of [src, ...fallbackSrcs]) {
      if (!source) continue;
      for (const candidate of catalogImageCandidates(source, widthHint)) unique.add(candidate);
    }
    return [...unique];
  }, [sourceKey, widthHint]);
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => setCandidateIndex(0), [sourceKey, widthHint]);

  const candidate = candidates[candidateIndex];
  if (!candidate) return <>{fallback}</>;

  return (
    <Image
      quality={80}
      {...imageProps}
      key={`${sourceKey}-${candidateIndex}`}
      src={candidate}
      onError={() => setCandidateIndex((index) => Math.min(index + 1, candidates.length))}
    />
  );
}
