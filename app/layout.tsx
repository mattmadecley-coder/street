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
// Homepage <title> also carries "streetdotcom" so a search for the domain-style
// name matches the page text exactly, not just the URL.
const homeTitle = "Street (streetdotcom) — Discover independent streetwear";
const description = "Street (streetdotcom) is a search engine for independent streetwear brands — browse them all in one place, then buy straight from the brand.";

// Structured data: tells Google the site's name is "Street" (also known as
// "streetdotcom"), which is what shows as the site name in search results,
// and links the official Instagram account to the site.
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: `${siteUrl}/`,
      name: "Street",
      alternateName: ["streetdotcom", "Street.com", "streetdotcom.com"],
      description,
      publisher: { "@id": `${siteUrl}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${siteUrl}/catalog?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "Street",
      alternateName: "streetdotcom",
      url: `${siteUrl}/`,
      logo: `${siteUrl}/icon.png`,
      sameAs: ["https://www.instagram.com/streetdotcomstreetwear/"],
    },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "Street",
  title: { default: homeTitle, template: "%s · Street" },
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
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
        />
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
