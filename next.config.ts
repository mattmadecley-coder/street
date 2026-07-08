import type { NextConfig } from "next";
import { STREET_BRANDS } from "./lib/brands";

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

// Build the next/image allowlist from the brand list itself, rather than a
// wildcard hostname. Product photos are hosted on each brand's own domain
// (custom domain) or on Shopify's CDN, so we allow both.
const brandHostnames = Array.from(
  new Set(
    STREET_BRANDS.map((brand) => hostnameOf(brand.storeUrl)).filter(
      (hostname): hostname is string => Boolean(hostname)
    )
  )
);

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      ...brandHostnames.map((hostname) => ({ protocol: "https" as const, hostname })),
      { protocol: "https" as const, hostname: "*.myshopify.com" },
      { protocol: "https" as const, hostname: "cdn.shopify.com" },
    ],
  },
};

export default nextConfig;
