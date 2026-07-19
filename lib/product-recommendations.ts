import type { StreetProduct } from "@/lib/catalog";
import { hasSupabaseCatalog, supabaseRest } from "@/lib/supabase-rest";

type RelatedProductRow = {
  id: string;
  handle: string;
  title: string;
  description: string;
  source_url: string;
  price: string | number;
  compare_at_price: string | number | null;
  stock_status: "in_stock" | "sold_out";
  is_preorder: boolean;
  primary_image_url: string | null;
  colors: string[] | null;
  sizes: string[] | null;
  category: string;
  tags: string[] | null;
  last_synced_at: string;
  created_at?: string | null;
  street_group: string | null;
  street_category: string | null;
  street_type: string | null;
  street_detail: string | null;
  brands: { slug: string; name: string } | null;
  product_images: Array<{ source_url: string; sort_order: number }> | null;
  product_variants: Array<{ external_id: string }> | null;
};

function toProduct(row: RelatedProductRow): StreetProduct {
  const images = [...(row.product_images ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((image) => image.source_url);
  const brandSlug = row.brands?.slug ?? "brand";
  return {
    id: row.id,
    slug: `${brandSlug}--${row.handle}`,
    handle: row.handle,
    brandSlug,
    brandName: row.brands?.name ?? "Unknown brand",
    title: row.title,
    description: row.description,
    sourceUrl: row.source_url,
    price: Number(row.price),
    compareAtPrice: row.compare_at_price == null ? undefined : Number(row.compare_at_price),
    stockStatus: row.stock_status,
    isPreorder: row.is_preorder,
    primaryImage: row.primary_image_url ?? images[0] ?? "",
    images,
    colors: row.colors ?? [],
    sizes: row.sizes ?? [],
    category: row.category,
    tags: row.tags ?? [],
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at ?? undefined,
    streetGroup: row.street_group ?? undefined,
    streetCategory: row.street_category ?? undefined,
    streetType: row.street_type ?? undefined,
    streetDetail: row.street_detail ?? undefined,
    variantCount: row.product_variants?.length ?? 0,
  };
}

const SELECT = "id,handle,title,description,source_url,price,compare_at_price,stock_status,is_preorder,primary_image_url,colors,sizes,category,tags,last_synced_at,created_at,street_group,street_category,street_type,street_detail,brands!inner(slug,name),product_images(source_url,sort_order),product_variants(external_id)";

export async function getRelatedProducts(product: StreetProduct, limit = 8): Promise<StreetProduct[]> {
  if (!hasSupabaseCatalog()) return [];
  try {
    const common = `products?select=${SELECT}&is_active=eq.true&is_hidden=eq.false&id=neq.${encodeURIComponent(product.id)}&order=last_synced_at.desc&limit=${limit}`;
    const brandQuery = `${common}&brands.slug=eq.${encodeURIComponent(product.brandSlug)}`;
    const category = product.streetCategory || product.category;
    const categoryQuery = category
      ? `${common}&${product.streetCategory ? "street_category" : "category"}=eq.${encodeURIComponent(category)}`
      : null;

    const [brandRows, categoryRows] = await Promise.all([
      supabaseRest<RelatedProductRow[]>(brandQuery),
      categoryQuery ? supabaseRest<RelatedProductRow[]>(categoryQuery) : Promise.resolve([]),
    ]);

    const unique = new Map<string, RelatedProductRow>();
    for (const row of [...brandRows, ...categoryRows]) unique.set(row.id, row);
    return [...unique.values()].slice(0, limit).map(toProduct);
  } catch (error) {
    console.error("Street related products read failed", error);
    return [];
  }
}
