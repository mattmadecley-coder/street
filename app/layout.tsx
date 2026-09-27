import type { Metadata } from "next";
import { Suspense } from "react";
import Script from "next/script";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import "./commerce.css";
import "./mobile.css";
import "./catalog-polish.css";
import { SiteMascot } from "@/components/mascot/site-mascot";
import { CartProvider } from "@/components/cart-context";
import { SavedProvider } from "@/components/saved-context";
import { AnalyticsTracker } from "@/components/analytics-tracker";
import { CatalogAnalytics } from "@/components/catalog-analytics";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const googleAnalyticsId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "G-E621RKXPX3";
// Cloudflare Web Analytics token from dashboard > Analytics & Logs > Web Analytics > Add a site.
// It's meant to be public (it ships in every page's HTML), so no fallback secret to worry about here.
const cloudflareBeaconToken = process.env.NEXT_PUBLIC_CF_BEACON_TOKEN;
const title = "Street — Discover independent streetwear";
const description = "Search independent streetwear brands in one place, then buy straight from the brand.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: title, template: "%s · Street" },
  description,
  // Routes below override this with their own path; this default covers
  // the homepage and any route that doesn't set its own canonical.
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Street",
    title,
    description,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Street — independent streetwear discovery" }],
  },
  twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <CartProvider>
          <SavedProvider>
            {children}
            <SiteMascot />
            <Suspense fallback={null}>
              <AnalyticsTracker />
              <CatalogAnalytics />
            </Suspense>
          </SavedProvider>
        </CartProvider>
      </body>
      <GoogleAnalytics gaId={googleAnalyticsId} />
      {cloudflareBeaconToken ? (
        <Script
          defer
          src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon={JSON.stringify({ token: cloudflareBeaconToken })}
        />
      ) : null}
    </html>
  );
}
