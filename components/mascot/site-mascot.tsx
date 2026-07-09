"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "./site-mascot.module.css";

/**
 * A small persistent character that lives at the bottom of the viewport
 * (position: fixed, so it survives scrolling and page navigation since it's
 * mounted once in the root layout) and wanders left/right on its own. On
 * product pages it reacts to how long the visitor has been looking: a
 * speech bubble after ~1 minute, a different one after ~3 minutes on the
 * same product. Both the walking and the reactions are intentionally simple
 * to start — more triggers (add-to-bag hesitation, price-drop pages, etc.)
 * can hang off the same dwellTimers pattern later.
 */

const DWELL_MESSAGES: Array<{ afterMs: number; text: string }> = [
  { afterMs: 60_000, text: "You'd look really nice in these." },
  { afterMs: 180_000, text: "You must really like these." },
];

const BUBBLE_VISIBLE_MS = 12_000;
const WALK_SPEED_PX_PER_MS = 0.05; // ~50px/sec
const IDLE_MIN_MS = 3_000;
const IDLE_MAX_MS = 8_000;

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function SiteMascot() {
  const pathname = usePathname();
  const [bubbleText, setBubbleText] = useState<string | null>(null);

  const moverRef = useRef<HTMLDivElement | null>(null);
  const spriteRef = useRef<HTMLDivElement | null>(null);

  const currentXRef = useRef(24);
  const walkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bubbleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dwellTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const hidden = pathname?.startsWith("/admin") ?? false;

  // Walking loop: pick a random spot, glide there at a constant speed with a
  // walk-cycle animation, pause a few seconds, repeat. Runs entirely by
  // mutating refs/DOM style directly (no per-frame React state) so it's
  // cheap and doesn't fight with the speech-bubble state above it.
  useEffect(() => {
    if (hidden) return;
    let cancelled = false;

    function charWidth() {
      return moverRef.current?.offsetWidth ?? 64;
    }

    function settleAt(x: number) {
      currentXRef.current = x;
      if (moverRef.current) moverRef.current.style.transform = `translateX(${x}px)`;
    }

    function scheduleNext(delay: number) {
      walkTimeoutRef.current = setTimeout(() => {
        if (!cancelled) walk();
      }, delay);
    }

    function walk() {
      const maxX = Math.max(0, window.innerWidth - charWidth());
      const targetX = randomBetween(0, maxX);
      const distance = Math.abs(targetX - currentXRef.current);
      if (distance < 8) {
        scheduleNext(randomBetween(IDLE_MIN_MS, IDLE_MAX_MS));
        return;
      }
      const facingLeft = targetX < currentXRef.current;
      const durationMs = distance / WALK_SPEED_PX_PER_MS;

      if (spriteRef.current) {
        spriteRef.current.style.transform = facingLeft ? "scaleX(-1)" : "scaleX(1)";
        spriteRef.current.classList.add(styles.walking);
      }
      if (moverRef.current) {
        moverRef.current.style.transitionDuration = `${durationMs}ms`;
        moverRef.current.style.transform = `translateX(${targetX}px)`;
      }
      currentXRef.current = targetX;

      walkTimeoutRef.current = setTimeout(() => {
        if (cancelled) return;
        spriteRef.current?.classList.remove(styles.walking);
        scheduleNext(randomBetween(IDLE_MIN_MS, IDLE_MAX_MS));
      }, durationMs);
    }

    // Start somewhere near the left on first mount.
    settleAt(randomBetween(20, 120));
    scheduleNext(randomBetween(1_500, 4_000));

    return () => {
      cancelled = true;
      if (walkTimeoutRef.current) clearTimeout(walkTimeoutRef.current);
    };
  }, [hidden]);

  // Dwell-time reactions: reset whenever the route changes, only arm on
  // product pages, and only fire each threshold once per page visit.
  useEffect(() => {
    dwellTimeoutsRef.current.forEach(clearTimeout);
    dwellTimeoutsRef.current = [];
    if (bubbleTimeoutRef.current) clearTimeout(bubbleTimeoutRef.current);
    setBubbleText(null);

    if (hidden) return;
    const isProductPage = /^\/products\//.test(pathname ?? "");
    if (!isProductPage) return;

    dwellTimeoutsRef.current = DWELL_MESSAGES.map(({ afterMs, text }) =>
      setTimeout(() => {
        setBubbleText(text);
        if (bubbleTimeoutRef.current) clearTimeout(bubbleTimeoutRef.current);
        bubbleTimeoutRef.current = setTimeout(() => setBubbleText(null), BUBBLE_VISIBLE_MS);
      }, afterMs)
    );

    return () => {
      dwellTimeoutsRef.current.forEach(clearTimeout);
    };
  }, [pathname, hidden]);

  if (hidden) return null;

  return (
    <div className={styles.wrapper} aria-hidden="true">
      <div ref={moverRef} className={styles.mover}>
        {bubbleText ? <div className={styles.bubble}>{bubbleText}</div> : null}
        <div ref={spriteRef} className={styles.sprite} />
      </div>
    </div>
  );
}
