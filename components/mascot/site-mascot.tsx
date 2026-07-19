"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CharacterPopup, CHARACTER_POPUP_EVENT, type CharacterPopupRequest } from "./character-popup";

type ActivePopup = Required<Pick<CharacterPopupRequest, "message" | "position" | "duration" | "characterImage">> & { id: number; visible: boolean };
type VariantEvent = CustomEvent<{ label?: string; available?: boolean }>;

const DEFAULT_IMAGE = "/public/images/ChatGPT%20Image%20Jul%2018%2C%202026%2C%2008_45_48%20PM.png";
const AUTO_MESSAGES = [
  "You’ve got good taste.",
  "This one would look good on you.",
  "Still thinking about it?",
  "Don’t forget to pick your size.",
];

// Temporary preview cadence. Reduce this before merging once the motion and sizing are approved.
const TEST_AUTO_DELAYS = [2_500, 11_000, 20_000];

export function SiteMascot() {
  const pathname = usePathname();
  const [active, setActive] = useState<ActivePopup | null>(null);
  const activeRef = useRef<ActivePopup | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<CharacterPopupRequest[]>([]);
  const id = useRef(0);
  const hidden = pathname?.startsWith("/admin") ?? false;

  const display = useCallback((request: CharacterPopupRequest) => {
    if (!request.message?.trim() || hidden) return;
    if (activeRef.current) {
      queue.current.push(request);
      return;
    }
    const next: ActivePopup = {
      id: ++id.current,
      message: request.message,
      position: request.position ?? "right",
      duration: request.duration ?? 4500,
      characterImage: request.characterImage ?? DEFAULT_IMAGE,
      visible: true,
    };
    activeRef.current = next;
    setActive(next);
    hideTimer.current = setTimeout(() => {
      setActive((current) => current ? { ...current, visible: false } : null);
      clearTimer.current = setTimeout(() => {
        activeRef.current = null;
        setActive(null);
        const queued = queue.current.shift();
        if (queued) window.setTimeout(() => display(queued), 180);
      }, 560);
    }, next.duration);
  }, [hidden]);

  useEffect(() => {
    function onExternal(event: Event) {
      display((event as CustomEvent<CharacterPopupRequest>).detail);
    }
    window.addEventListener(CHARACTER_POPUP_EVENT, onExternal);
    return () => window.removeEventListener(CHARACTER_POPUP_EVENT, onExternal);
  }, [display]);

  useEffect(() => {
    queue.current = [];
    activeRef.current = null;
    setActive(null);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (clearTimer.current) clearTimeout(clearTimer.current);
    if (hidden || !pathname?.startsWith("/products/")) return;

    const testTimers = TEST_AUTO_DELAYS.map((delay, index) => window.setTimeout(() => {
      display({
        position: "cart",
        message: AUTO_MESSAGES[index % AUTO_MESSAGES.length],
        duration: 3600,
      });
    }, delay));

    function onVariant(event: Event) {
      const detail = (event as VariantEvent).detail ?? {};
      display({
        position: "cart",
        message: detail.available === false
          ? "That option just sold out."
          : detail.label
            ? `${detail.label} works. Your size is still available.`
            : "Your size is still available.",
        duration: 4000,
      });
    }

    function onAdded() {
      display({ position: "right", message: "Added to your StreetBag.", duration: 3600 });
    }

    window.addEventListener("street:variant-selected", onVariant);
    window.addEventListener("street:cart-added", onAdded);
    return () => {
      testTimers.forEach(window.clearTimeout);
      window.removeEventListener("street:variant-selected", onVariant);
      window.removeEventListener("street:cart-added", onAdded);
    };
  }, [pathname, hidden, display]);

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (clearTimer.current) clearTimeout(clearTimer.current);
  }, []);

  if (hidden || !active) return null;
  return <CharacterPopup message={active.message} position={active.position} duration={active.duration} characterImage={active.characterImage} visible={active.visible} />;
}
