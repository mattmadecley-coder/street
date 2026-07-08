import { STREET_BRANDS } from "@/lib/brands";
import { getStoredCatalog } from "@/lib/catalog-store";
import { getStoredProduct } from "@/lib/catalog-page";
import { importBrandCatalog, type ImportedProduct } from "@/lib/source-import";

export type StreetProduct = {
  id: string;
  slug: string;
  handle: string;
  brandSlug: string;
  brandName: string;
  title: string;
  description: string;
  sourceUrl: string;
  price: number;
  compareAtPrice?: number;
  stockStatus: "in_stock" | "sold_out";
  isPreorder: boolean;
  primaryImage: string;
  images: string[];
  colors: string[];
  sizes: string[];
  category: string;
  tags: string[];
  lastSyncedAt: string;
};

type CatalogSource = "database" | "live" | "fallback";

function toStreetProduct(brandSlug: string, brandName: string, product: ImportedProduct): StreetProduct {
  return {
    id: `${brandSlug}-${product.externalId}`,
    slug: `${brandSlug}--${product.handle}`,
    handle: product.handle,
    brandSlug,
    brandName,
    title: product.title,
    description: product.description,
    sourceUrl: product.sourceUrl,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    stockStatus: product.stockStatus,
    isPreorder: product.isPreorder,
    primaryImage: product.images[0] ?? "",
    images: product.images,
    colors: product.colors,
    sizes: product.sizes,
    category: product.category,
    tags: product.tags,
    lastSyncedAt: new Date().toISOString(),
  };
}

const fallbackProducts: StreetProduct[] = [
  { id: "fallback-74-army", slug: "seventy-four-uniform--army-moto-bike-jacket", handle: "army-moto-bike-jacket", brandSlug: "seventy-four-uniform", brandName: "Seventy Four Uniform", title: "Army Moto-Bike Jacket", description: "Catalog data will appear after the first completed database sync.", sourceUrl: "https://www.seventyfouruniform.com/products/army-moto-bike-jacket", price: 220, stockStatus: "in_stock", isPreorder: false, primaryImage: "", images: [], colors: ["Army", "Green"], sizes: [], category: "Outerwear", tags: ["streetwear", "moto", "military"], lastSyncedAt: new Date().toISOString() },
  { id: "fallback-clutch-sweatshirt", slug: "clutch-supply--cars-4-christ-sweatshirt", handle: "cars-4-christ-sweatshirt", brandSlug: "clutch-supply", brandName: "Clutch Supply", title: "Cars 4 Christ Sweatshirt", description: "Catalog data will appear after the first completed database sync.", sourceUrl: "https://clutchsupplyla.com/products/cars-4-christ-sweatshirt", price: 98, stockStatus: "in_stock", isPreorder: false, primaryImage: "", images: [], colors: [], sizes: [], category: "Hoodies & Sweatshirts", tags: ["streetwear", "sweatshirt"], lastSyncedAt: new Date().toISOString() },
];

export async function getCatalog(): Promise<{ products: StreetProduct[]; source: CatalogSource }> {
  const stored = await getStoredCatalog();
  if (stored?.length) return { products: stored, source: "database" };

  const live = await Promise.all(STREET_BRANDS.map(async (brand) => {
    const products = await importBrandCatalog(brand);
    return products.map((product) => toStreetProduct(brand.slug, brand.name, product));
  }));
  const products = live.flat();
  if (products.length) return { products, source: "live" };
  return { products: fallbackProducts, source: "fallback" };
}

export async function getProduct(slug: string) {
  // Fast path: ask Supabase for this exact product directly. Falls back to the
  // full catalog scan below only when Supabase isn't configured yet, or the
  // saved catalog doesn't have this product (e.g. before the first sync).
  const direct = await getStoredProduct(slug);
  if (direct) return { product: direct, source: "database" as const };

  const catalog = await getCatalog();
  return { ...catalog, product: catalog.products.find((product) => product.slug === slug) };
}
