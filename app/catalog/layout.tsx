import { Suspense } from "react";
import { MobileCatalogFilters } from "@/components/mobile-catalog-filters";

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return <><Suspense fallback={null}><MobileCatalogFilters /></Suspense>{children}</>;
}
