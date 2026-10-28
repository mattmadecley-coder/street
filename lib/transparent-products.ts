import sharp from "sharp";
import { readAdminState, writeAdminState } from "@/lib/admin-state";
import { hasSupabaseCatalog, supabaseRestAll } from "@/lib/supabase-rest";

export type TransparentProduct = {
  id: string;
  title: string;
  imageUrl: string;
  transparentFraction: number;
  width: number;
  height: number;
  format: string | null;
};

type StoredPool = {
  version: 1;
  scannedAt: string;
  scannedProducts: number;
  scannedImages: number;
  failedImages: number;
  products: TransparentProduct[];
};

type CatalogImage = { source_url: string; sort_order: number };
type CatalogProduct = {
  id: string;
  title: string;
  primary_image_url: string | null;
  product_images: CatalogImage[] | null;
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 15_000;
const SCAN_CONCURRENCY = 8;
const MIN_TRANSPARENT_FRACTION = 0.08;

function uniqueUrls(product: CatalogProduct) {
  return [...new Set([
    product.primary_image_url,
    ...(product.product_images ?? []).sort((a, b) => a.sort_order - b.sort_order).map((image) => image.source_url),
  ].filter((url): url is string => typeof url === "string" && /^https?:\/\//i.test(url)))];
}

async function inspectImage(url: string): Promise<Omit<TransparentProduct, "id" | "title" | "imageUrl"> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!response.ok) return null;
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_IMAGE_BYTES) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_BYTES) return null;

    const metadata = await sharp(buffer).metadata();
    if (!metadata.hasAlpha || !metadata.width || !metadata.height) return null;
    const { data, info } = await sharp(buffer)
      .ensureAlpha()
      .resize({ width: 72, height: 72, fit: "inside", withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const channels = info.channels || 4;
    const pixels = info.width * info.height;
    let transparentPixels = 0;
    for (let offset = channels - 1; offset < data.length; offset += channels) {
      if ((data[offset] ?? 255) <= 8) transparentPixels += 1;
    }
    const transparentFraction = pixels ? transparentPixels / pixels : 0;
    if (transparentFraction < MIN_TRANSPARENT_FRACTION) return null;
    return {
      transparentFraction: Math.round(transparentFraction * 1000) / 1000,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format ?? null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Read the one-time scan result. The pool intentionally stays stable until rescanned. */
export async function getTransparentProductPool(limit = 24): Promise<TransparentProduct[]> {
  try {
    const state = await readAdminState<StoredPool | null>("transparent_product_pool", null);
    if (!state.available || !state.value || state.value.version !== 1) return [];
    return state.value.products.filter((product) => product.imageUrl && /^https?:\/\//i.test(product.imageUrl)).slice(0, Math.max(0, Math.min(limit, 48)));
  } catch {
    return [];
  }
}

/**
 * Scan the active catalog once for real alpha transparency and persist the
 * result in server-only admin state. It is safe to run again when the catalog
 * changes; the previous pool is replaced only after the new scan completes.
 */
export async function scanTransparentProductPool(): Promise<StoredPool> {
  if (!hasSupabaseCatalog()) throw new Error("The catalog database is not configured.");
  const products = await supabaseRestAll<CatalogProduct[]>(
    "products?select=id,title,primary_image_url,product_images(source_url,sort_order)&is_active=eq.true&is_hidden=eq.false&order=updated_at.desc",
    500,
    25_000,
  );
  const selected: TransparentProduct[] = [];
  let scannedImages = 0;
  let failedImages = 0;
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= products.length) return;
      const product = products[index];
      for (const imageUrl of uniqueUrls(product)) {
        scannedImages += 1;
        const inspected = await inspectImage(imageUrl);
        if (inspected) {
          selected.push({ id: product.id, title: product.title.slice(0, 140), imageUrl, ...inspected });
          break;
        }
        failedImages += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, Math.max(1, products.length)) }, () => worker()));
  selected.sort((a, b) => a.id.localeCompare(b.id));
  const pool: StoredPool = {
    version: 1,
    scannedAt: new Date().toISOString(),
    scannedProducts: products.length,
    scannedImages,
    failedImages,
    products: selected,
  };
  await writeAdminState("transparent_product_pool", pool);
  return pool;
}
