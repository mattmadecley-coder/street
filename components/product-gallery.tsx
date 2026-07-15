"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import styles from "./product-gallery.module.css";
import { useProductVariantFocus } from "@/components/product-variant-context";
import { MEDIA_BLUR_DATA_URL } from "@/lib/media-placeholders";

/**
 * Desktop keeps the original layout: every photo stacked vertically, all
 * visible at once (plenty of width/height to work with). On mobile that
 * same stack meant scrolling through 5-10 full-height images one after
 * another just to see the back of a hoodie - this switches to a horizontal
 * swipe carousel below the 840px breakpoint (CSS scroll-snap, no JS needed
 * for the swipe itself), with dot indicators that both reflect the current
 * slide (via a scroll listener) and jump to a slide on tap.
 */
export function ProductGallery({ images, title }: { images: string[]; title: string }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [active, setActive] = useState(0);
  const galleryImages = images.length ? images : [""];
  const { focusImage } = useProductVariantFocus();

  useEffect(() => {
    if (!focusImage) return;
    const index = galleryImages.indexOf(focusImage);
    if (index === -1) return;
    slideRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    setActive(index);
  }, [focusImage, galleryImages]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    function onScroll() {
      if (!track) return;
      const width = track.clientWidth || 1;
      const index = Math.round(track.scrollLeft / width);
      setActive((prev) => {
        const next = Math.max(0, Math.min(galleryImages.length - 1, index));
        return next === prev ? prev : next;
      });
    }

    track.addEventListener("scroll", onScroll, { passive: true });
    return () => track.removeEventListener("scroll", onScroll);
  }, [galleryImages.length]);

  function scrollToIndex(index: number) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: track.clientWidth * index, behavior: "smooth" });
  }

  return (
    <section className={styles.gallery} aria-label={`${title} image gallery`}>
      <div className={styles.track} ref={trackRef}>
        {galleryImages.map((image, index) => (
          <div className={styles.slide} key={`${image}-${index}`} ref={(el) => { slideRefs.current[index] = el; }}>
            {image ? (
              <Image
                src={image}
                alt={`${title} — image ${index + 1} of ${galleryImages.length}`}
                fill
                preload={index === 0}
                fetchPriority={index === 0 ? "high" : "low"}
                loading={index === 0 ? undefined : "lazy"}
                quality={index === 0 ? 80 : 75}
                sizes="(max-width: 840px) 100vw, 60vw"
                placeholder="blur"
                blurDataURL={MEDIA_BLUR_DATA_URL}
                style={{ objectFit: "contain" }}
              />
            ) : (
              <div style={{ height: "100%", width: "100%", background: "linear-gradient(135deg,#d7d4cc,#a7a49e)" }} />
            )}
          </div>
        ))}
      </div>
      {galleryImages.length > 1 ? (
        <div className={styles.dots}>
          {galleryImages.map((_, index) => (
            <button
              key={index}
              type="button"
              className={index === active ? styles.dotActive : styles.dot}
              aria-label={`Go to image ${index + 1} of ${galleryImages.length}`}
              aria-current={index === active}
              onClick={() => scrollToIndex(index)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
