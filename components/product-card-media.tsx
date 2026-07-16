"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { MEDIA_BLUR_DATA_URL } from "@/lib/media-placeholders";

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
    if (!secondImage || loadAlternate || !primaryLoaded || !nearViewport) return;
    if (typeof window !== "undefined" && !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const timer = window.setTimeout(() => setLoadAlternate(true), priority ? 0 : 180);
    return () => window.clearTimeout(timer);
  }, [loadAlternate, nearViewport, primaryLoaded, priority, secondImage]);

  if (!primaryImage) {
    return <div aria-hidden="true" style={{ position: "absolute", inset: 8, background: "#ebe9e3" }} />;
  }

  return (
    <div
      ref={containerRef}
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
        fetchPriority={priority ? "high" : "auto"}
        loading={priority ? undefined : "lazy"}
        quality={75}
        sizes="(max-width: 840px) 50vw, (max-width: 1280px) 33vw, 25vw"
        placeholder="blur"
        blurDataURL={MEDIA_BLUR_DATA_URL}
        className="card-image-primary"
        style={{ objectFit: "contain" }}
        onLoad={() => setPrimaryLoaded(true)}
      />
      {secondImage && loadAlternate ? (
        <Image
          src={secondImage}
          alt=""
          aria-hidden
          fill
          loading="eager"
          fetchPriority="low"
          quality={70}
          sizes="(max-width: 840px) 50vw, (max-width: 1280px) 33vw, 25vw"
          placeholder="blur"
          blurDataURL={MEDIA_BLUR_DATA_URL}
          className="card-image-secondary"
          style={{ objectFit: "contain" }}
        />
      ) : null}
    </div>
  );
}
