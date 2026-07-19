import type { StreetProduct } from "@/lib/catalog";
import { getCatalogPage, type CatalogPageFilters } from "@/lib/catalog-page";

type ShelfOptions = {
  limit?: number;
  perBrandCap?: number;
  perCategoryCap?: number;
  poolPages?: number;
};

function categoryBucket(product: StreetProduct) {
  return (
    product.streetCategory ||
    product.streetGroup ||
    product.category ||
    "Other"
  ).trim().toLowerCase();
}

function canPick(
  product: StreetProduct,
  perBrandCount: Map<string, number>,
  perCategoryCount: Map<string, number>,
  perBrandCap: number,
  perCategoryCap: number,
) {
  return (
    (perBrandCount.get(product.brandSlug) ?? 0) < perBrandCap &&
    (perCategoryCount.get(categoryBucket(product)) ?? 0) < perCategoryCap
  );
}

function addProduct(
  product: StreetProduct,
  picked: StreetProduct[],
  pickedIds: Set<string>,
  perBrandCount: Map<string, number>,
  perCategoryCount: Map<string, number>,
) {
  picked.push(product);
  pickedIds.add(product.id);
  perBrandCount.set(product.brandSlug, (perBrandCount.get(product.brandSlug) ?? 0) + 1);
  const bucket = categoryBucket(product);
  perCategoryCount.set(bucket, (perCategoryCount.get(bucket) ?? 0) + 1);
}

/**
 * Builds homepage shelves that stay varied even after a large single-brand or
 * single-category import. The first pass takes one item from each taxonomy
 * category, then later passes fill the shelf while respecting brand/category
 * caps. When inventory is limited, the final pass fills any remaining slots
 * in newest-first order instead of leaving the shelf short.
 */
export async function getCategoryDiverseProductShelf(
  filters: Omit<CatalogPageFilters, "page">,
  {
    limit = 10,
    perBrandCap = 2,
    perCategoryCap = 2,
    poolPages = 4,
  }: ShelfOptions = {},
): Promise<StreetProduct[]> {
  const pool: StreetProduct[] = [];

  for (let page = 1; page <= poolPages; page += 1) {
    const result = await getCatalogPage({ ...filters, page });
    if (!result?.products.length) break;
    pool.push(...result.products);
    if (pool.length >= result.total) break;
  }

  const picked: StreetProduct[] = [];
  const pickedIds = new Set<string>();
  const perBrandCount = new Map<string, number>();
  const perCategoryCount = new Map<string, number>();
  const representedCategories = new Set<string>();

  // First guarantee breadth: one item per available category.
  for (const product of pool) {
    if (picked.length >= limit) break;
    const bucket = categoryBucket(product);
    if (representedCategories.has(bucket)) continue;
    if ((perBrandCount.get(product.brandSlug) ?? 0) >= perBrandCap) continue;
    addProduct(product, picked, pickedIds, perBrandCount, perCategoryCount);
    representedCategories.add(bucket);
  }

  // Then fill while keeping both brands and categories from dominating.
  for (const product of pool) {
    if (picked.length >= limit) break;
    if (pickedIds.has(product.id)) continue;
    if (!canPick(product, perBrandCount, perCategoryCount, perBrandCap, perCategoryCap)) continue;
    addProduct(product, picked, pickedIds, perBrandCount, perCategoryCount);
  }

  // Relax category limits before brand limits.
  for (const product of pool) {
    if (picked.length >= limit) break;
    if (pickedIds.has(product.id)) continue;
    if ((perBrandCount.get(product.brandSlug) ?? 0) >= perBrandCap) continue;
    addProduct(product, picked, pickedIds, perBrandCount, perCategoryCount);
  }

  // Limited inventory should still produce a full shelf.
  for (const product of pool) {
    if (picked.length >= limit) break;
    if (pickedIds.has(product.id)) continue;
    addProduct(product, picked, pickedIds, perBrandCount, perCategoryCount);
  }

  return picked;
}
