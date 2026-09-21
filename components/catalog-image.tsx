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
 * Loads remote catalog media through ImageKit's free "Web proxy" CDN (see
 * lib/catalog-image.ts) instead of Next's own server-side image optimizer.
 * We tried Next's optimizer directly on Render and it 500/503'd under a
 * catalog grid's concurrent load (free/starter plan, not enough CPU) --
 * ImageKit does the resizing/AVIF-WebP conversion at its own edge instead,
 * so Render never touches it. `unoptimized` stays on so Next doesn't also
 * try to process the already-optimized ImageKit URL. Failed candidates fall
 * back down the chain built in catalogImageCandidates, then to any supplied
 * alternate images.
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
