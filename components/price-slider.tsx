"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const FLOOR = 0;
const CEILING = 1000;
const STEP = 5;

/**
 * Dual-thumb price slider for Shop All. Reads/writes the same `min`/`max`
 * query params the server-rendered filter form always has, so it works
 * whether or not JS has hydrated yet (the form still submits a plain number
 * input as a fallback — see app/catalog/page.tsx).
 */
export function PriceRangeSlider({ initialMin, initialMax }: { initialMin?: number; initialMax?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [min, setMin] = useState(initialMin && initialMin > FLOOR ? initialMin : FLOOR);
  const [max, setMax] = useState(initialMax && initialMax < CEILING ? initialMax : CEILING);

  useEffect(() => {
    setMin(initialMin && initialMin > FLOOR ? initialMin : FLOOR);
    setMax(initialMax && initialMax < CEILING ? initialMax : CEILING);
  }, [initialMin, initialMax]);

  function commit(nextMin: number, nextMax: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    if (nextMin > FLOOR) params.set("min", String(nextMin)); else params.delete("min");
    if (nextMax < CEILING) params.set("max", String(nextMax)); else params.delete("max");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const minPercent = ((min - FLOOR) / (CEILING - FLOOR)) * 100;
  const maxPercent = ((max - FLOOR) / (CEILING - FLOOR)) * 100;

  return (
    <div className="price-range">
      <div className="price-range-values">
        <span>${min}</span>
        <span>{max >= CEILING ? `$${CEILING}+` : `$${max}`}</span>
      </div>
      <div className="price-range-track">
        <div className="price-range-rail" />
        <div className="price-range-fill" style={{ left: `${minPercent}%`, width: `${Math.max(0, maxPercent - minPercent)}%` }} />
        <input
          type="range"
          min={FLOOR}
          max={CEILING}
          step={STEP}
          value={min}
          aria-label="Minimum price"
          onChange={(event) => setMin(Math.min(Number(event.target.value), max - STEP))}
          onMouseUp={() => commit(min, max)}
          onTouchEnd={() => commit(min, max)}
          onKeyUp={() => commit(min, max)}
        />
        <input
          type="range"
          min={FLOOR}
          max={CEILING}
          step={STEP}
          value={max}
          aria-label="Maximum price"
          onChange={(event) => setMax(Math.max(Number(event.target.value), min + STEP))}
          onMouseUp={() => commit(min, max)}
          onTouchEnd={() => commit(min, max)}
          onKeyUp={() => commit(min, max)}
        />
      </div>
    </div>
  );
}
