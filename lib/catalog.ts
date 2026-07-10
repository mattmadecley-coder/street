import { STREET_BRANDS } from "@/lib/brands";
import { getStoredCatalog } from "@/lib/catalog-store";
import { getStoredProduct } from "@/lib/catalog-page";
import { importBrandCatalog, type ImportedProduct } from "@/lib/source-import";

// A single purchasable option (a Shopify variant) under a product - usually
// a color/size combination. Every read path populates variantCount; the
// full variants array is only populated where the UI actually needs
// per-option detail (currently: the product detail page) to keep listing
// queries (catalog grid, homepage shelves, collections) cheap.
export type ProductVariantSummary = {
  externalId: string;
  title: string;
  price: number;
  compareAtPrice?: number;
  available: boolean;
  option1?: string;
  option2?: string;
  option3?: string;
};

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
  // Street taxonomy (lib/street-taxonomy.ts) assigned during classification.
  // Undefined for products that haven't been classified yet (e.g. the live
  // source-import fallback path below never sets these).
  streetGroup?: string;
  streetCategory?: string;
  streetType?: string;
  streetDetail?: string;
  // How many purchasable variants (color/size combinations) this product
  // has on the brand's own store. Always populated; used for the "N
  // options" badge on product cards.
  variantCount: number;
  // Per-variant detail (title, price, availability). Only populated by read
  // paths that need it - see the comment on ProductVariantSummary.
  variants?: ProductVariantSummary[];
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
    variantCount: product.variants.length,
    variants: product.variants.map((variant) => ({
      externalId: variant.externalId,
      title: variant.title,
      price: variant.price,
      compareAtPrice: variant.compareAtPrice,
      available: variant.available,
      option1: variant.option1,
      option2: variant.option2,
      option3: variant.option3,
    })),
  };
}

const fallbackProducts: StreetProduct[] = [
  { id: "fallback-74-army", slug: "seventy-four-uniform--army-moto-bike-jacket", handle: "army-moto-bike-jacket", brandSlug: "seventy-four-uniform", brandName: "Seventy Four Uniform", title: "Army Moto-Bike Jacket", description: "Catalog data will appear after the first completed database sync.", sourceUrl: "https://www.seventyfouruniform.com/products/army-moto-bike-jacket", price: 220, stockStatus: "in_stock", isPreorder: false, primaryImage: "", images: [], colors: ["Army", "Green"], sizes: [], category: "Outerwear", tags: ["streetwear", "moto", "military"], lastSyncedAt: new Date().toISOString(), variantCount: 0 },
  { id: "fallback-clutch-sweatshirt", slug: "clutch-supply--cars-4-christ-sweatshirt", handle: "cars-4-christ-sweatshirt", brandSlug: "clutch-supply", brandName: "Clutch Supply", title: "Cars 4 Christ Sweatshirt", description: "Catalog data will appear after the first completed database sync.", sourceUrl: "https://clutchsupplyla.com/products/cars-4-christ-sweatshirt", price: 98, stockStatus: "in_stock", isPreorder: false, primaryImage: "", images: [], colors: [], sizes: [], category: "Hoodies & Sweatshirts", tags: ["streetwear", "sweatshirt"], lastSyncedAt: new Date().toISOString(), variantCount: 0 },
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
