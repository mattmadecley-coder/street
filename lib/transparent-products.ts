import sharp from "sharp";
import { readAdminState, writeAdminState } from "@/lib/admin-state";
import { hasSupabaseCatalog, supabaseRestPage } from "@/lib/supabase-rest";

export type TransparentProduct = {
  id: string;
  title: string;
  imageUrl: string;
  originalImageUrl?: string;
  transparentFraction: number;
  width: number;
  height: number;
  format: string | null;
};

type StoredPool = {
  version: 2;
  scannedAt: string;
  totalProducts: number;
  nextOffset: number;
  complete: boolean;
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
const IMAGE_TIMEOUT_MS = 2_500;
const SCAN_CONCURRENCY = 32;
export const TRANSPARENT_SCAN_BATCH_SIZE = 512;
const MIN_TRANSPARENT_FRACTION = 0.08;

function uniqueUrls(product: CatalogProduct) {
  const urls = [...new Set([
    product.primary_image_url,
    ...(product.product_images ?? []).sort((a, b) => a.sort_order - b.sort_order).map((image) => image.source_url),
  ].filter((url): url is string => typeof url === "string" && /^https?:\/\//i.test(url)))];
  // JPEG cannot carry an alpha channel, so avoid spending time downloading
  // the majority of the catalog. Keep extensionless CDN URLs as fallbacks.
  const alphaCandidates = urls.filter((url) => {
    const cleanUrl = url.split(/[?#]/, 1)[0];
    return /\.(?:png|webp|avif|gif|svg)$/i.test(cleanUrl) || !/\.[a-z0-9]{2,5}$/i.test(cleanUrl);
  });
  return alphaCandidates;
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
export async function getTransparentProductPool(limit = 48): Promise<TransparentProduct[]> {
  try {
    const state = await readAdminState<StoredPool | null>("transparent_product_pool", null);
    if (!state.available || !state.value || state.value.version !== 2 || !state.value.complete) return [];
    return state.value.products.filter((product) => product.imageUrl && /^https?:\/\//i.test(product.imageUrl)).slice(0, Math.max(0, Math.min(limit, 48)));
  } catch {
    return [];
  }
}

/**
 * Scan one bounded catalog page for real alpha transparency and persist the
 * result in server-only admin state. Keeping the scan resumable avoids a
 * single long-running request when the catalog contains many remote images.
 */
export async function scanTransparentProductPoolBatch(offset = 0, batchSize = TRANSPARENT_SCAN_BATCH_SIZE): Promise<StoredPool> {
  if (!hasSupabaseCatalog()) throw new Error("The catalog database is not configured.");
  const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));
  const safeBatchSize = Math.max(48, Math.min(TRANSPARENT_SCAN_BATCH_SIZE, Math.floor(Number(batchSize) || TRANSPARENT_SCAN_BATCH_SIZE)));
  const path = "products?select=id,title,primary_image_url,product_images(source_url,sort_order)&is_active=eq.true&is_hidden=eq.false&order=updated_at.desc";
  const page = await supabaseRestPage<CatalogProduct>(path, { from: safeOffset, to: safeOffset + safeBatchSize - 1 }, { noStore: true });
  const priorState = safeOffset > 0 ? await readAdminState<StoredPool | null>("transparent_product_pool", null) : null;
  const selectedById = new Map<string, TransparentProduct>();
  if (priorState?.available && priorState.value?.version === 2) {
    for (const product of priorState.value.products) selectedById.set(product.id, product);
  }
  let scannedImages = 0;
  let failedImages = 0;
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= page.data.length) return;
      const product = page.data[index];
      for (const imageUrl of uniqueUrls(product)) {
        scannedImages += 1;
        const inspected = await inspectImage(imageUrl);
        if (inspected) {
          selectedById.set(product.id, { id: product.id, title: product.title.slice(0, 140), imageUrl, ...inspected });
          break;
        }
        failedImages += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, Math.max(1, page.data.length)) }, () => worker()));
  const totalProducts = page.total || priorState?.value?.totalProducts || safeOffset + page.data.length;
  const nextOffset = Math.min(totalProducts, safeOffset + page.data.length);
  const complete = nextOffset >= totalProducts || page.data.length === 0;
  const selected = [...selectedById.values()].sort((a, b) => a.id.localeCompare(b.id));
  const pool: StoredPool = {
    version: 2,
    scannedAt: priorState?.value?.scannedAt ?? new Date().toISOString(),
    totalProducts,
    nextOffset,
    complete,
    scannedProducts: nextOffset,
    scannedImages: (priorState?.value?.scannedImages ?? 0) + scannedImages,
    failedImages: (priorState?.value?.failedImages ?? 0) + failedImages,
    products: selected,
  };
  await writeAdminState("transparent_product_pool", pool);
  return pool;
}
