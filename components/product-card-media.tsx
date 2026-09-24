"use client";

import { useEffect, useRef, useState } from "react";
import { CatalogImage } from "@/components/catalog-image";
import { MEDIA_BLUR_DATA_URL } from "@/lib/media-placeholders";

function UnavailableProductImage() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "#ebe9e3",
        color: "rgba(16,16,16,.46)",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: ".1em",
        textTransform: "uppercase",
      }}
    >
      Image unavailable
    </div>
  );
}

// Some brands' source data lists two *different* file URLs for what is
// really the same single product photo -- a re-export, a re-compress, a
// duplicate upload under a new asset id. Our string-equality check
// (product.images[1] !== primaryImage in ProductCard) only catches an
// exact URL match, so these slip through as a "second image" and the
// hover-swap fires on what the shopper sees as one photo: it reads as a
// glitchy flicker rather than a useful alternate view. Once both images
// have actually loaded (so this reuses the browser's own cache instead of
// issuing new requests), downsample both onto a tiny shared canvas and
// compare average pixel difference -- two truly different photos (a back
// view, a different color, a model shot) diverge far more than two
// re-saves of the same shot. Below the threshold, drop the swap entirely
// so the card behaves like the single-image product it actually is.
const DUPLICATE_DIFF_THRESHOLD = 4;
const duplicateCheckCache: Map<string, boolean> =
  typeof window !== "undefined" ? ((window as unknown as { __streetDupImgCache?: Map<string, boolean> }).__streetDupImgCache ??= new Map()) : new Map();

async function loadBitmap(url: string) {
  const response = await fetch(url);
  const blob = await response.blob();
  return createImageBitmap(blob);
}

async function imagesLookIdentical(urlA: string, urlB: string): Promise<boolean> {
  const cacheKey = `${urlA}\n${urlB}`;
  const cached = duplicateCheckCache.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const [bitmapA, bitmapB] = await Promise.all([loadBitmap(urlA), loadBitmap(urlB)]);
    const width = 24;
    const height = 30;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;

    ctx.drawImage(bitmapA, 0, 0, width, height);
    const pixelsA = ctx.getImageData(0, 0, width, height).data;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(bitmapB, 0, 0, width, height);
    const pixelsB = ctx.getImageData(0, 0, width, height).data;

    let diff = 0;
    for (let i = 0; i < pixelsA.length; i += 4) {
      diff += Math.abs(pixelsA[i] - pixelsB[i]) + Math.abs(pixelsA[i + 1] - pixelsB[i + 1]) + Math.abs(pixelsA[i + 2] - pixelsB[i + 2]);
    }
    const identical = diff / (width * height * 3) < DUPLICATE_DIFF_THRESHOLD;
    duplicateCheckCache.set(cacheKey, identical);
    return identical;
  } catch {
    // Fetch/CORS/decoding hiccup -- fail open and keep the swap rather than
    // silently hiding a genuinely different second photo.
    return false;
  }
}

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [primaryLoaded, setPrimaryLoaded] = useState(false);
  const [nearViewport, setNearViewport] = useState(priority);
  const [loadAlternate, setLoadAlternate] = useState(false);
  const [suppressAsDuplicate, setSuppressAsDuplicate] = useState(false);

  useEffect(() => {
    if (!secondImage || priority || loadAlternate) return;
    const element = containerRef.current;
    if (!element || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setNearViewport(true);
        observer.disconnect();
      },
      { rootMargin: "350px 0px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [loadAlternate, priority, secondImage]);

  useEffect(() => {
    // Preload the hover-swap image as soon as the primary photo has loaded
    // and the card is near the viewport, on every device — not only ones
    // with a fine hover pointer. On touch devices there's no hover event to
    // wait for, so gating this behind "(hover: hover)" meant the second
    // image never started fetching until the shopper's first tap (which is
    // also what triggers the swap), and they'd sit looking at a blank/slow
    // second image. A short delay still lets the primary image's own
    // request win the priority race.
    if (!secondImage || loadAlternate || !primaryLoaded || !nearViewport) return;

    const timer = window.setTimeout(() => setLoadAlternate(true), priority ? 0 : 180);
    return () => window.clearTimeout(timer);
  }, [loadAlternate, nearViewport, primaryLoaded, priority, secondImage]);

  useEffect(() => {
    setSuppressAsDuplicate(false);
  }, [primaryImage, secondImage]);

  function handleSecondaryLoad() {
    const element = containerRef.current;
    if (!element) return;
    const primaryEl = element.querySelector<HTMLImageElement>(".card-image-primary");
    const secondaryEl = element.querySelector<HTMLImageElement>(".card-image-secondary");
    const primarySrc = primaryEl?.currentSrc || primaryEl?.src;
    const secondarySrc = secondaryEl?.currentSrc || secondaryEl?.src;
    if (!primarySrc || !secondarySrc) return;
    void imagesLookIdentical(primarySrc, secondarySrc).then((identical) => {
      if (identical) setSuppressAsDuplicate(true);
    });
  }

  if (!primaryImage) {
    return <div aria-hidden="true" style={{ position: "absolute", inset: 8, background: "#ebe9e3" }} />;
  }

  const showAlternate = Boolean(secondImage) && loadAlternate && !suppressAsDuplicate;

  return (
    <div
      ref={containerRef}
      className={`card-media-layer${showAlternate ? " card-media-has-alt" : ""}`}
      style={{ position: "absolute", inset: 8 }}
      onPointerEnter={() => setLoadAlternate(true)}
      onFocusCapture={() => setLoadAlternate(true)}
    >
      <CatalogImage
        src={primaryImage}
        fallbackSrcs={secondImage ? [secondImage] : undefined}
        widthHint={400}
        fallback={<UnavailableProductImage />}
        alt={title}
        fill
        preload={priority}
        fetchPriority={priority ? "high" : "auto"}
        loading={priority ? undefined : "lazy"}
        sizes="(max-width: 840px) 50vw, (max-width: 1280px) 33vw, 25vw"
        placeholder="blur"
        blurDataURL={MEDIA_BLUR_DATA_URL}
        className="card-image-primary"
        style={{ objectFit: "contain" }}
        onLoad={() => setPrimaryLoaded(true)}
      />
      {showAlternate ? (
        <CatalogImage
          src={secondImage!}
          widthHint={400}
          fallback={null}
          alt=""
          aria-hidden
          fill
          loading="eager"
          fetchPriority="low"
          sizes="(max-width: 840px) 50vw, (max-width: 1280px) 33vw, 25vw"
          placeholder="blur"
          blurDataURL={MEDIA_BLUR_DATA_URL}
          className="card-image-secondary"
          style={{ objectFit: "contain" }}
          onLoad={handleSecondaryLoad}
        />
      ) : null}
    </div>
  );
}
