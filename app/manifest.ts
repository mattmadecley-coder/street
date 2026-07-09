import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Street — Discover independent streetwear",
    short_name: "Street",
    description: "Search independent streetwear brands in one place, then buy straight from the brand.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f3ee",
    theme_color: "#101010",
    icons: [
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
