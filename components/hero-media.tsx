"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { MEDIA_BLUR_DATA_URL } from "@/lib/media-placeholders";

export function HeroMedia({ videoUrl, imageUrl, className }: { videoUrl?: string; imageUrl?: string; className: string }) {
  const [videoReady, setVideoReady] = useState(false);
  const [loadVideo, setLoadVideo] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoUrl) return;

    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;

    // Start shortly after first paint so the MP4 does not compete with the
    // initial page shell, but do not suppress it for prefers-reduced-motion.
    // Some Windows desktop configurations expose that preference even when the
    // user still expects the muted hero video to play, which previously left a
    // black hero whenever no separate poster image was configured.
    const start = () => setLoadVideo(true);
    const idleWindow = window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (idleWindow.requestIdleCallback) {
      const id = idleWindow.requestIdleCallback(start, { timeout: 800 });
      return () => idleWindow.cancelIdleCallback?.(id);
    }

    const id = window.setTimeout(start, 250);
    return () => window.clearTimeout(id);
  }, [videoUrl]);

  useEffect(() => {
    if (!loadVideo || !videoRef.current) return;
    const video = videoRef.current;
    video.muted = true;
    const attemptPlayback = () => {
      void video.play().catch(() => {
        // Keep the fallback visible if the browser blocks playback. A later
        // canplay/visibility event can still retry without flashing black.
        setVideoReady(false);
      });
    };
    attemptPlayback();
    document.addEventListener("visibilitychange", attemptPlayback);
    return () => document.removeEventListener("visibilitychange", attemptPlayback);
  }, [loadVideo, videoUrl]);

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
          ref={videoRef}
          className={className}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onLoadedData={() => setVideoReady(true)}
          onCanPlay={() => setVideoReady(true)}
          onPlaying={() => setVideoReady(true)}
          onError={() => setVideoReady(false)}
          style={{ opacity: videoReady ? 1 : 0, transition: "opacity .18s ease" }}
        >
          <source src={videoUrl} type="video/mp4" />
        </video>
      ) : null}
    </>
  );
}
