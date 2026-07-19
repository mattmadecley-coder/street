"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CharacterPopup, CHARACTER_POPUP_EVENT, type CharacterPopupRequest } from "./character-popup";

type ActivePopup = Required<Pick<CharacterPopupRequest, "message" | "position" | "duration" | "characterImage">> & { id: number };
type VariantEvent = CustomEvent<{ label?: string; available?: boolean }>;

const DEFAULT_IMAGE = "/images/street-character.png";
const AUTO_MESSAGES = ["You’ve got good taste.", "This one would look good on you.", "Still thinking about it?"];

export function SiteMascot() {
  const pathname = usePathname();
  const [active, setActive] = useState<ActivePopup | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<CharacterPopupRequest[]>([]);
  const id = useRef(0);
  const hidden = pathname?.startsWith("/admin") ?? false;

  const display = useCallback((request: CharacterPopupRequest) => {
    if (!request.message.trim() || hidden) return;
    if (active) {
      queue.current.push(request);
      return;
    }
    const next: ActivePopup = {
      id: ++id.current,
      message: request.message,
      position: request.position ?? "right",
      duration: request.duration ?? 4500,
      characterImage: request.characterImage ?? DEFAULT_IMAGE,
    };
    setActive(next);
    hideTimer.current = setTimeout(() => {
      setActive((current) => current ? { ...current, duration: 0 } : null);
      clearTimer.current = setTimeout(() => {
        setActive(null);
        const queued = queue.current.shift();
        if (queued) setTimeout(() => display(queued), 180);
      }, 450);
    }, next.duration);
  }, [active, hidden]);

  useEffect(() => {
    function onExternal(event: Event) {
      display((event as CustomEvent<CharacterPopupRequest>).detail);
    }
    window.addEventListener(CHARACTER_POPUP_EVENT, onExternal);
    return () => window.removeEventListener(CHARACTER_POPUP_EVENT, onExternal);
  }, [display]);

  useEffect(() => {
    queue.current = [];
    setActive(null);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (clearTimer.current) clearTimeout(clearTimer.current);
    if (hidden || !pathname?.startsWith("/products/")) return;

    const sessionKey = `street:character-auto:${pathname}`;
    const alreadyShown = sessionStorage.getItem(sessionKey) === "1";
    const autoTimer = alreadyShown ? null : setTimeout(() => {
      sessionStorage.setItem(sessionKey, "1");
      display({ position: "cart", message: AUTO_MESSAGES[Math.floor(Math.random() * AUTO_MESSAGES.length)], duration: 4500 });
    }, 7500);

    function onVariant(event: Event) {
      const detail = (event as VariantEvent).detail ?? {};
      if (detail.available === false) display({ position: "cart", message: "That option just sold out.", duration: 3800 });
      else display({ position: "cart", message: detail.label ? `${detail.label} works. Your size is still available.` : "Your size is still available.", duration: 4000 });
    }
    function onAdded() {
      display({ position: "right", message: "Added to your StreetBag.", duration: 3600 });
    }

    window.addEventListener("street:variant-selected", onVariant);
    window.addEventListener("street:cart-added", onAdded);
    return () => {
      if (autoTimer) clearTimeout(autoTimer);
      window.removeEventListener("street:variant-selected", onVariant);
      window.removeEventListener("street:cart-added", onAdded);
    };
  }, [pathname, hidden, display]);

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (clearTimer.current) clearTimeout(clearTimer.current);
  }, []);

  if (hidden || !active) return null;
  return <CharacterPopup {...active} visible={active.duration > 0} />;
}
