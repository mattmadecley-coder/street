import { hasSupabaseCatalog, supabaseRest } from "@/lib/supabase-rest";
import { criteriaToParams, paramsToQuery, type ProductCriteria } from "@/lib/product-criteria";
import type { EmailBlock, ProductCard, ProductsOrder } from "@/lib/email-blocks";

const ORDER: Record<ProductsOrder, string> = { newest: "created_at.desc", price_asc: "price.asc", price_desc: "price.desc" };

type Row = { id: string; handle: string; title: string; price: string | number; compare_at_price: string | number | null; primary_image_url: string | null; brands: { slug: string; name: string } | null };

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "https://streetdotcom.com").replace(/\/$/, "");

/** Live catalog products for one products block, as cards ready for the email renderer. */
export async function findProductCards(criteria: ProductCriteria, count: number, order: ProductsOrder, nowMs: number = Date.now()): Promise<ProductCard[]> {
  if (!hasSupabaseCatalog()) return [];
  const params = criteriaToParams(criteria, nowMs);
  params.push(["deleted_at", "is.null"], ["select", "id,handle,title,price,compare_at_price,primary_image_url,brands!inner(slug,name)"], ["order", `${ORDER[order]},id.asc`]);
  const want = criteria.onSale ? Math.min(count * 5, 200) : count;
  const rows = await supabaseRest<Row[]>(`products?${paramsToQuery(params)}&limit=${want}`, { noStore: true });
  const kept = criteria.onSale ? rows.filter((row) => row.compare_at_price != null && Number(row.compare_at_price) > Number(row.price)) : rows;
  return kept.slice(0, count).map((row) => ({
    title: row.title,
    brandName: row.brands?.name ?? "",
    price: Number(row.price),
    imageUrl: row.primary_image_url ?? "",
    url: `${siteUrl()}/products/${row.brands?.slug ?? "brand"}--${row.handle}`,
  }));
}

/** Resolves every products block in a layout (used for previews and, later, at send time). */
export async function resolveProducts(blocks: EmailBlock[]): Promise<Record<string, ProductCard[]>> {
  const out: Record<string, ProductCard[]> = {};
  for (const block of blocks) {
    if (block.type !== "products") continue;
    out[block.id] = await findProductCards(block.criteria, block.count, block.order).catch(() => []);
  }
  return out;
}
