import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Product photos come from whatever domain each brand's own store (or
    // its CDN) happens to use — that list changes every time a brand is
    // added through /admin/brands/new, and admin-added brands aren't known
    // at build time. A per-hostname allowlist built from a static brand
    // list (the old approach) silently breaks images for any brand whose
    // photos aren't on one of those exact hostnames, with no way to fix it
    // short of a code change + redeploy. Wildcarding https-only keeps the
    // one guarantee that actually matters (no plain-http image fetches)
    // without re-introducing that failure mode.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async redirects() {
    // These two brands used to have dedicated static pages before brands
    // became fully DB-driven; every brand (including these) now gets an
    // equivalent view at /catalog?brand=<slug>. Redirect instead of letting
    // old links/bookmarks/search results 404.
    return [
      { source: "/brands/seventy-four-uniform", destination: "/catalog?brand=seventy-four-uniform", permanent: true },
      { source: "/brands/clutch-supply", destination: "/catalog?brand=clutch-supply", permanent: true },
    ];
  },
};

export default nextConfig;
