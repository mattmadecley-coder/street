"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

// Reads `sq` (the search term that led here) on the client instead of the
// server, so this product page can stay eligible for on-demand ISR instead
// of being forced into Next's dynamic-only fallback path (see page.tsx).
export function ProductSearchBackLink() {
  const searchParams = useSearchParams();
  const sq = searchParams.get("sq");
  if (!sq) return null;
  return (
    <p className="product-back-link">
      <Link href={`/catalog?q=${encodeURIComponent(sq)}`}>← Back to results for “{sq}”</Link>
    </p>
  );
}
