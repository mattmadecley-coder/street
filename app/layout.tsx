import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import "./commerce.css";
import "./mobile.css";
import { SiteMascot } from "@/components/mascot/site-mascot";
import { CartProvider } from "@/components/cart-context";
import { AnalyticsTracker } from "@/components/analytics-tracker";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const title = "Street — Discover independent streetwear";
const description = "Search independent streetwear brands in one place, then buy straight from the brand.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: title, template: "%s · Street" },
  description,
  openGraph: { type: "website", siteName: "Street", title, description },
  twitter: { card: "summary_large_image", title, description },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <CartProvider>
          {children}
          <SiteMascot />
          <Suspense fallback={null}><AnalyticsTracker /></Suspense>
        </CartProvider>
      </body>
    </html>
  );
}
