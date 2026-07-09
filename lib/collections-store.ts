import { hasSupabaseCatalog, supabaseRest, supabaseRestAll } from "@/lib/supabase-rest";
import type { StreetProduct } from "@/lib/catalog";

type ImageRow = { source_url: string; sort_order: number };
type ProductRow = {
  id: string;
  handle: string;
  title: string;
  description: string;
  source_url: string;
  price: string | number;
  compare_at_price: string | number | null;
  stock_status: "in_stock" | "sold_out";
  is_preorder: boolean;
  category: string;
  tags: string[];
  colors: string[];
  sizes: string[];
  primary_image_url: string | null;
  last_synced_at: string;
  brands: { slug: string; name: string } | null;
  product_images: ImageRow[] | null;
  street_group: string | null;
  street_category: string | null;
  street_type: string | null;
  street_detail: string | null;
};

const number = (value: string | number | null | undefined) => Number(value ?? 0);

function toStreetProduct(row: ProductRow): StreetProduct {
  const brandSlug = row.brands?.slug ?? "brand";
  const images = [...(row.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((image) => image.source_url);
  return {
    id: `${brandSlug}-${row.id}`,
    slug: `${brandSlug}--${row.handle}`,
    handle: row.handle,
    brandSlug,
    brandName: row.brands?.name ?? "Brand",
    title: row.title,
    description: row.description,
    sourceUrl: row.source_url,
    price: number(row.price),
    compareAtPrice: row.compare_at_price != null ? number(row.compare_at_price) : undefined,
    stockStatus: row.stock_status,
    isPreorder: row.is_preorder,
    primaryImage: row.primary_image_url ?? images[0] ?? "",
    images: images.length ? images : row.primary_image_url ? [row.primary_image_url] : [],
    colors: row.colors ?? [],
    sizes: row.sizes ?? [],
    category: row.category,
    tags: row.tags ?? [],
    lastSyncedAt: row.last_synced_at,
    streetGroup: row.street_group ?? undefined,
    streetCategory: row.street_category ?? undefined,
    streetType: row.street_type ?? undefined,
    streetDetail: row.street_detail ?? undefined,
  };
}

export type CollectionRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  coverImageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  productCount: number;
};

/** Admin list view: every collection plus how many products are in each. */
export async function listCollections(): Promise<CollectionRow[]> {
  if (!hasSupabaseCatalog()) return [];
  try {
    const [collections, links] = await Promise.all([
      supabaseRest<Array<{ id: string; slug: string; title: string; subtitle: string | null; cover_image_url: string | null; is_active: boolean; sort_order: number; created_at: string }>>(
        "collections?select=id,slug,title,subtitle,cover_image_url,is_active,sort_order,created_at&order=sort_order.asc,created_at.asc",
        { noStore: true }
      ),
      supabaseRestAll<Array<{ collection_id: string }>>("collection_products?select=collection_id"),
    ]);
    const counts = new Map<string, number>();
    for (const link of links) counts.set(link.collection_id, (counts.get(link.collection_id) ?? 0) + 1);
    return collections.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      subtitle: row.subtitle,
      coverImageUrl: row.cover_image_url,
      isActive: row.is_active,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      productCount: counts.get(row.id) ?? 0,
    }));
  } catch (error) {
    console.error("Street collections list read failed", error);
    return [];
  }
}

export type CollectionWithProducts = CollectionRow & { products: StreetProduct[] };

/** Admin edit view: one collection plus its products in curated order. */
export async function getCollectionBySlug(slug: string): Promise<CollectionWithProducts | null> {
  if (!hasSupabaseCatalog()) return null;
  try {
    const rows = await supabaseRest<Array<{ id: string; slug: string; title: string; subtitle: string | null; cover_image_url: string | null; is_active: boolean; sort_order: number; created_at: string }>>(
      `collections?slug=eq.${encodeURIComponent(slug)}&select=id,slug,title,subtitle,cover_image_url,is_active,sort_order,created_at&limit=1`,
      { noStore: true }
    );
    const collection = rows[0];
    if (!collection) return null;

    const links = await supabaseRest<Array<{ product_id: string; sort_order: number }>>(
      `collection_products?collection_id=eq.${collection.id}&select=product_id,sort_order&order=sort_order.asc`,
      { noStore: true }
    );
    if (!links.length) {
      return { id: collection.id, slug: collection.slug, title: collection.title, subtitle: collection.subtitle, coverImageUrl: collection.cover_image_url, isActive: collection.is_active, sortOrder: collection.sort_order, createdAt: collection.created_at, productCount: 0, products: [] };
    }

    const idList = links.map((link) => link.product_id).join(",");
    const productRows = await supabaseRest<ProductRow[]>(
      `products?id=in.(${idList})&select=*,brands(slug,name),product_images(source_url,sort_order)`,
      { noStore: true }
    );
    // Sort by the raw product UUID (row.id) before mapping to StreetProduct -
    // StreetProduct.id is "brandSlug-uuid" and brand slugs can contain
    // hyphens themselves, so recovering the UUID by splitting that string
    // back apart would be fragile. Easier to just sort first.
    const bySortOrder = new Map(links.map((link) => [link.product_id, link.sort_order]));
    const products = [...productRows]
      .sort((a, b) => (bySortOrder.get(a.id) ?? 0) - (bySortOrder.get(b.id) ?? 0))
      .map(toStreetProduct);

    return { id: collection.id, slug: collection.slug, title: collection.title, subtitle: collection.subtitle, coverImageUrl: collection.cover_image_url, isActive: collection.is_active, sortOrder: collection.sort_order, createdAt: collection.created_at, productCount: products.length, products };
  } catch (error) {
    console.error("Street collection read failed", error);
    return null;
  }
}

/** Public homepage read: active collections (with >=1 live, visible product) ready to render as shelves. */
export async function getActiveCollectionsForHomepage(): Promise<Array<{ slug: string; title: string; subtitle: string | null; products: StreetProduct[] }>> {
  if (!hasSupabaseCatalog()) return [];
  try {
    const collections = await supabaseRest<Array<{ id: string; slug: string; title: string; subtitle: string | null }>>(
      "collections?is_active=eq.true&select=id,slug,title,subtitle&order=sort_order.asc,created_at.asc"
    );
    if (!collections.length) return [];

    const links = await supabaseRestAll<Array<{ collection_id: string; product_id: string; sort_order: number }>>(
      "collection_products?select=collection_id,product_id,sort_order&order=sort_order.asc"
    );
    const productIds = [...new Set(links.map((link) => link.product_id))];
    if (!productIds.length) return [];

    const productRows = await supabaseRest<ProductRow[]>(
      `products?id=in.(${productIds.join(",")})&is_active=eq.true&is_hidden=eq.false&select=*,brands!inner(slug,name),product_images(source_url,sort_order)`
    );
    const productById = new Map(productRows.map((row) => [row.id, toStreetProduct(row)]));

    const byCollection = new Map<string, Array<{ productId: string; sortOrder: number }>>();
    for (const link of links) {
      if (!byCollection.has(link.collection_id)) byCollection.set(link.collection_id, []);
      byCollection.get(link.collection_id)!.push({ productId: link.product_id, sortOrder: link.sort_order });
    }

    return collections
      .map((collection) => {
        const entries = (byCollection.get(collection.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
        const products = entries.map((entry) => productById.get(entry.productId)).filter((product): product is StreetProduct => Boolean(product));
        return { slug: collection.slug, title: collection.title, subtitle: collection.subtitle, products };
      })
      .filter((collection) => collection.products.length > 0);
  } catch (error) {
    console.error("Street active collections read failed", error);
    return [];
  }
}

/** Public single-collection read for /collections/[slug] - only active collections, only live/visible products. */
export async function getPublicCollection(slug: string): Promise<{ title: string; subtitle: string | null; products: StreetProduct[] } | null> {
  if (!hasSupabaseCatalog()) return null;
  try {
    const rows = await supabaseRest<Array<{ id: string; title: string; subtitle: string | null; is_active: boolean }>>(
      `collections?slug=eq.${encodeURIComponent(slug)}&select=id,title,subtitle,is_active&limit=1`
    );
    const collection = rows[0];
    if (!collection || !collection.is_active) return null;

    const links = await supabaseRestAll<Array<{ product_id: string; sort_order: number }>>(
      `collection_products?collection_id=eq.${collection.id}&select=product_id,sort_order&order=sort_order.asc`
    );
    if (!links.length) return null;

    const productIds = links.map((link) => link.product_id);
    const productRows = await supabaseRest<ProductRow[]>(
      `products?id=in.(${productIds.join(",")})&is_active=eq.true&is_hidden=eq.false&select=*,brands!inner(slug,name),product_images(source_url,sort_order)`
    );
    const bySortOrder = new Map(links.map((link) => [link.product_id, link.sort_order]));
    const products = [...productRows]
      .sort((a, b) => (bySortOrder.get(a.id) ?? 0) - (bySortOrder.get(b.id) ?? 0))
      .map(toStreetProduct);

    if (!products.length) return null;
    return { title: collection.title, subtitle: collection.subtitle, products };
  } catch (error) {
    console.error("Street public collection read failed", error);
    return null;
  }
}

export async function createCollection(input: { slug: string; title: string; subtitle?: string; coverImageUrl?: string }): Promise<void> {
  await supabaseRest("collections", {
    method: "POST",
    body: { slug: input.slug, title: input.title, subtitle: input.subtitle || null, cover_image_url: input.coverImageUrl || null },
    prefer: "return=minimal",
  });
}

export async function updateCollection(id: string, patch: { title?: string; subtitle?: string | null; coverImageUrl?: string | null; isActive?: boolean; sortOrder?: number }): Promise<void> {
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.subtitle !== undefined) body.subtitle = patch.subtitle;
  if (patch.coverImageUrl !== undefined) body.cover_image_url = patch.coverImageUrl;
  if (patch.isActive !== undefined) body.is_active = patch.isActive;
  if (patch.sortOrder !== undefined) body.sort_order = patch.sortOrder;
  await supabaseRest(`collections?id=eq.${id}`, { method: "PATCH", body, prefer: "return=minimal" });
}

export async function deleteCollection(id: string): Promise<void> {
  await supabaseRest(`collections?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" });
}

/** Looks up real product UUIDs (not the "brandSlug-uuid" StreetProduct.id) by title/brand for the admin picker. */
export async function searchProductsForPicker(query: string, limit = 12): Promise<Array<{ id: string; title: string; brandName: string; price: string | number; primaryImageUrl: string | null }>> {
  if (!hasSupabaseCatalog() || !query.trim()) return [];
  const cleaned = query.trim().replace(/[%,()]/g, " ");
  try {
    const rows = await supabaseRest<Array<{ id: string; title: string; price: string | number; primary_image_url: string | null; brands: { name: string } | null }>>(
      `products?select=id,title,price,primary_image_url,brands(name)&is_active=eq.true&is_hidden=eq.false&title=ilike.*${encodeURIComponent(cleaned)}*&order=updated_at.desc&limit=${limit}`,
      { noStore: true }
    );
    return rows.map((row) => ({ id: row.id, title: row.title, brandName: row.brands?.name ?? "Brand", price: row.price, primaryImageUrl: row.primary_image_url }));
  } catch (error) {
    console.error("Street collection product search failed", error);
    return [];
  }
}

export async function addProductToCollection(collectionId: string, productId: string): Promise<void> {
  const existing = await supabaseRest<Array<{ sort_order: number }>>(`collection_products?collection_id=eq.${collectionId}&select=sort_order&order=sort_order.desc&limit=1`, { noStore: true });
  const nextSortOrder = (existing[0]?.sort_order ?? -1) + 1;
  await supabaseRest("collection_products", {
    method: "POST",
    body: { collection_id: collectionId, product_id: productId, sort_order: nextSortOrder },
    prefer: "resolution=ignore-duplicates,return=minimal",
  });
}

export async function removeProductFromCollection(collectionId: string, productId: string): Promise<void> {
  await supabaseRest(`collection_products?collection_id=eq.${collectionId}&product_id=eq.${productId}`, { method: "DELETE", prefer: "return=minimal" });
}

/** Swaps this product's sort_order with its neighbor in the given direction, for simple up/down reordering. */
export async function moveProductInCollection(collectionId: string, productId: string, direction: "up" | "down"): Promise<void> {
  const rows = await supabaseRest<Array<{ product_id: string; sort_order: number }>>(
    `collection_products?collection_id=eq.${collectionId}&select=product_id,sort_order&order=sort_order.asc`,
    { noStore: true }
  );
  const index = rows.findIndex((row) => row.product_id === productId);
  if (index === -1) return;
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= rows.length) return;

  const current = rows[index];
  const swap = rows[swapIndex];
  await Promise.all([
    supabaseRest(`collection_products?collection_id=eq.${collectionId}&product_id=eq.${current.product_id}`, { method: "PATCH", body: { sort_order: swap.sort_order }, prefer: "return=minimal" }),
    supabaseRest(`collection_products?collection_id=eq.${collectionId}&product_id=eq.${swap.product_id}`, { method: "PATCH", body: { sort_order: current.sort_order }, prefer: "return=minimal" }),
  ]);
}
