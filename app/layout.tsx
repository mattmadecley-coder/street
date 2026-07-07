import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Street — Discover independent streetwear",
  description: "Search independent streetwear brands in one place.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
