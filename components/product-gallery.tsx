"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import styles from "./product-gallery.module.css";
import { useProductVariantFocus } from "@/components/product-variant-context";
import { MEDIA_BLUR_DATA_URL } from "@/lib/media-placeholders";

export function ProductGallery({ images, title }: { images: string[]; title: string }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [active, setActive] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
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
      setActive(Math.max(0, Math.min(galleryImages.length - 1, Math.round(track.scrollLeft / width))));
    }
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => track.removeEventListener("scroll", onScroll);
  }, [galleryImages.length]);

  useEffect(() => {
    if (!fullscreen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setFullscreen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [fullscreen]);

  function scrollToIndex(index: number) {
    setActive(index);
    const track = trackRef.current;
    if (track && window.matchMedia("(max-width: 840px)").matches) track.scrollTo({ left: track.clientWidth * index, behavior: "smooth" });
    else slideRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return <section className={styles.gallery} aria-label={`${title} image gallery`}>
    {galleryImages.length > 1 ? <div className={styles.thumbnails} aria-label="Product image thumbnails">{galleryImages.map((image, index) => <button key={`${image}-${index}`} type="button" className={index === active ? styles.thumbnailActive : styles.thumbnail} onClick={() => scrollToIndex(index)} aria-label={`View image ${index + 1}`}><span>{image ? <Image src={image} alt="" fill sizes="72px" style={{ objectFit: "contain" }} /> : null}</span></button>)}</div> : null}
    <div className={styles.track} ref={trackRef}>
      {galleryImages.map((image, index) => <div className={styles.slide} key={`${image}-${index}`} ref={(el) => { slideRefs.current[index] = el; }}>
        {image ? <button type="button" className={styles.imageButton} onClick={() => { setActive(index); setFullscreen(true); }} aria-label={`Enlarge image ${index + 1} of ${galleryImages.length}`}><Image src={image} alt={`${title} — image ${index + 1} of ${galleryImages.length}`} fill preload={index === 0} fetchPriority={index === 0 ? "high" : "low"} loading={index === 0 ? undefined : "lazy"} quality={index === 0 ? 82 : 76} sizes="(max-width: 840px) 100vw, 58vw" placeholder="blur" blurDataURL={MEDIA_BLUR_DATA_URL} style={{ objectFit: "contain" }} /></button> : <div className={styles.placeholder} />}
      </div>)}
    </div>
    <div className={styles.mobileProgress}><span>{active + 1} / {galleryImages.length}</span>{galleryImages.length > 1 ? <div className={styles.dots}>{galleryImages.map((_, index) => <button key={index} type="button" className={index === active ? styles.dotActive : styles.dot} aria-label={`Go to image ${index + 1}`} aria-current={index === active} onClick={() => scrollToIndex(index)} />)}</div> : null}</div>
    {fullscreen ? <div className={styles.fullscreen} role="dialog" aria-modal="true" aria-label={`${title} enlarged image`}><button type="button" className={styles.fullscreenClose} onClick={() => setFullscreen(false)} aria-label="Close enlarged image">Close ×</button>{galleryImages[active] ? <Image src={galleryImages[active]} alt={`${title} — enlarged image ${active + 1}`} fill sizes="100vw" quality={90} style={{ objectFit: "contain" }} /> : null}<button type="button" className={styles.fullscreenPrev} onClick={() => setActive((active - 1 + galleryImages.length) % galleryImages.length)} aria-label="Previous image">←</button><button type="button" className={styles.fullscreenNext} onClick={() => setActive((active + 1) % galleryImages.length)} aria-label="Next image">→</button></div> : null}
  </section>;
}
