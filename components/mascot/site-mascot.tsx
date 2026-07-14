"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "./site-mascot.module.css";

type ProductContext = {
  title: string;
  brand: string;
  price: number;
  stock: string;
  category: string;
  colors: string[];
};

type VariantEvent = CustomEvent<{ label?: string; available?: boolean }>;

const BUBBLE_VISIBLE_MS = 9_000;
const WALK_SPEED_PX_PER_MS = 0.05;
const IDLE_MIN_MS = 3_000;
const IDLE_MAX_MS = 8_000;
const REACTION_COOLDOWN_MS = 8_000;

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readProductContext(): ProductContext | null {
  const node = document.querySelector<HTMLElement>("[data-mascot-product]");
  if (!node) return null;
  return {
    title: node.dataset.title ?? "",
    brand: node.dataset.brand ?? "",
    price: Number(node.dataset.price ?? 0),
    stock: node.dataset.stock ?? "",
    category: node.dataset.category ?? "",
    colors: (node.dataset.colors ?? "").split("|").map((color) => color.trim()).filter(Boolean),
  };
}

function firstProductComment(product: ProductContext): string {
  const category = product.category.toLowerCase();
  const colors = product.colors.map((color) => color.toLowerCase());

  if (product.stock === "sold_out") return "Of course the good one is sold out.";
  if (product.price > 0 && product.price <= 50) return "Wait... this is actually a good price.";
  if (product.price >= 250) return "I like it too, but that price is serious.";
  if (colors.some((color) => color.includes("red"))) return "The red is doing all the work here.";
  if (category.includes("dress")) return "Okay, where are we wearing this?";
  if (category.includes("hoodie")) return "A good hoodie is hard to argue with.";
  if (category.includes("jacket") || category.includes("outerwear")) return "This could carry the whole outfit.";
  if (category.includes("shoe") || category.includes("sneaker") || category.includes("footwear")) return "These would change the whole fit.";
  return product.brand ? `${product.brand} knew what they were doing with this one.` : "This one has your attention.";
}

export function SiteMascot() {
  const pathname = usePathname();
  const [bubbleText, setBubbleText] = useState<string | null>(null);

  const moverRef = useRef<HTMLDivElement | null>(null);
  const spriteRef = useRef<HTMLDivElement | null>(null);
  const currentXRef = useRef(24);
  const walkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bubbleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactionTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastReactionAtRef = useRef(0);
  const targetLockUntilRef = useRef(0);

  const hidden = pathname?.startsWith("/admin") ?? false;

  const showBubble = useCallback((text: string, force = false) => {
    const now = Date.now();
    if (!force && now - lastReactionAtRef.current < REACTION_COOLDOWN_MS) return false;
    lastReactionAtRef.current = now;
    setBubbleText(text);
    if (bubbleTimeoutRef.current) clearTimeout(bubbleTimeoutRef.current);
    bubbleTimeoutRef.current = setTimeout(() => setBubbleText(null), BUBBLE_VISIBLE_MS);
    return true;
  }, []);

  const moveNearShopButton = useCallback(() => {
    const button = document.querySelector<HTMLElement>('[data-mascot-target="shop-button"]');
    const mover = moverRef.current;
    if (!button || !mover) return false;

    const rect = button.getBoundingClientRect();
    const charWidth = mover.offsetWidth || 64;
    const isVisible = rect.bottom > 0 && rect.top < window.innerHeight;
    if (!isVisible) return false;

    const buttonCenter = rect.left + rect.width / 2;
    const targetX = clamp(buttonCenter - charWidth - 12, 4, window.innerWidth - charWidth - 4);
    const facingLeft = buttonCenter < targetX + charWidth / 2;
    const distance = Math.abs(targetX - currentXRef.current);
    const durationMs = Math.max(250, distance / WALK_SPEED_PX_PER_MS);

    targetLockUntilRef.current = Date.now() + durationMs + BUBBLE_VISIBLE_MS;
    mover.style.transitionDuration = `${durationMs}ms`;
    mover.style.transform = `translateX(${targetX}px)`;
    currentXRef.current = targetX;
    if (spriteRef.current) {
      spriteRef.current.style.transform = facingLeft ? "scaleX(-1)" : "scaleX(1)";
      spriteRef.current.classList.add(styles.attention);
      setTimeout(() => spriteRef.current?.classList.remove(styles.attention), durationMs + BUBBLE_VISIBLE_MS);
    }
    return true;
  }, []);

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
      if (Date.now() < targetLockUntilRef.current) {
        scheduleNext(2_000);
        return;
      }
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

    settleAt(randomBetween(20, 120));
    scheduleNext(randomBetween(1_500, 4_000));

    return () => {
      cancelled = true;
      if (walkTimeoutRef.current) clearTimeout(walkTimeoutRef.current);
    };
  }, [hidden]);

  useEffect(() => {
    reactionTimeoutsRef.current.forEach(clearTimeout);
    reactionTimeoutsRef.current = [];
    if (bubbleTimeoutRef.current) clearTimeout(bubbleTimeoutRef.current);
    setBubbleText(null);
    lastReactionAtRef.current = 0;
    targetLockUntilRef.current = 0;

    if (hidden || !/^\/products\//.test(pathname ?? "")) return;
    const product = readProductContext();
    if (!product) return;

    reactionTimeoutsRef.current.push(
      setTimeout(() => showBubble(firstProductComment(product)), 22_000),
      setTimeout(() => showBubble("You've been looking at this for a minute."), 60_000),
      setTimeout(() => {
        if (moveNearShopButton()) showBubble("I'm not saying buy it... but the button is right there.", true);
      }, 85_000)
    );

    function onVariantSelected(event: Event) {
      const detail = (event as VariantEvent).detail ?? {};
      if (detail.available === false) {
        showBubble("That one is sold out. Tragic.");
        return;
      }
      const label = detail.label?.trim();
      showBubble(label ? `${label}? Yeah, that one works.` : "Yeah, that variation is better.");
    }

    const shopButton = document.querySelector<HTMLElement>('[data-mascot-target="shop-button"]');
    function onShopClick() {
      targetLockUntilRef.current = Date.now() + 5_000;
      spriteRef.current?.classList.add(styles.celebrating);
      showBubble("Okayyy. Go see what they're talking about.", true);
      setTimeout(() => spriteRef.current?.classList.remove(styles.celebrating), 3_000);
    }

    window.addEventListener("street:variant-selected", onVariantSelected);
    shopButton?.addEventListener("click", onShopClick);
    return () => {
      reactionTimeoutsRef.current.forEach(clearTimeout);
      window.removeEventListener("street:variant-selected", onVariantSelected);
      shopButton?.removeEventListener("click", onShopClick);
    };
  }, [pathname, hidden, moveNearShopButton, showBubble]);

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
