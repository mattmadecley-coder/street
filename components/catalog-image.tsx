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
 * Loads remote catalog media directly from the brand/CDN instead of routing it
 * through Vercel's billable /_next/image endpoint. Failed resized Shopify URLs
 * fall back to the original asset, then to any supplied alternate images.
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
      {...imageProps}
      key={`${sourceKey}-${candidateIndex}`}
      src={candidate}
      unoptimized
      onError={() => setCandidateIndex((index) => Math.min(index + 1, candidates.length))}
    />
  );
}
