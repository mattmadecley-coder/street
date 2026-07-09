import styles from "@/app/admin/admin.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { TaxonomyPicker } from "@/components/admin/taxonomy-picker";
import { supabaseRest } from "@/lib/supabase-rest";
import { getAllBrands } from "@/lib/catalog-store";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { updateProductTaxonomy, hideProduct, deleteProduct } from "./actions";

export const dynamic = "force-dynamic";

type AdminProductRow = {
  id: string;
  title: string;
  price: string | number;
  primary_image_url: string | null;
  street_group: string | null;
  street_category: string | null;
  street_type: string | null;
  street_detail: string | null;
  street_activity: string | null;
  street_tags: string[] | null;
  classification_status: string;
  is_hidden: boolean;
  stock_status: string;
  brands: { slug: string; name: string } | null;
};

const STATUS_OPTIONS = [
  { value: "needs_review", label: "Needs review" },
  { value: "pending", label: "Pending classification" },
  { value: "classified", label: "Classified" },
  { value: "error", label: "Errored" },
  { value: "all", label: "All statuses" },
];

async function searchProducts(q: string | undefined, status: string, brandSlug: string | undefined) {
  const params = new URLSearchParams();
  params.set("select", "id,title,price,primary_image_url,street_group,street_category,street_type,street_detail,street_activity,street_tags,classification_status,is_hidden,stock_status,brands!inner(slug,name)");
  params.set("is_active", "eq.true");
  params.set("order", "updated_at.desc");
  params.set("limit", "30");
  if (status !== "all") params.set("classification_status", `eq.${status}`);
  if (q?.trim()) params.set("title", `ilike.*${q.trim().replace(/[%,()]/g, " ")}*`);
  if (brandSlug) params.set("brands.slug", `eq.${brandSlug}`);

  try {
    return await supabaseRest<AdminProductRow[]>(`products?${params.toString()}`, { noStore: true });
  } catch (error) {
    console.error("Street admin product search failed", error);
    return [];
  }
}

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; brand?: string; saved?: string }> }) {
  const { q, status: statusParam, brand: brandParam, saved } = await searchParams;
  const status = statusParam ?? "needs_review";
  const returnTo = `/admin/products?status=${encodeURIComponent(status)}${brandParam ? `&brand=${encodeURIComponent(brandParam)}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const [products, brands] = await Promise.all([searchProducts(q, status, brandParam), getAllBrands()]);

  return (
    <div className={styles.shell}>
      <AdminNav active="/admin/products" />
      <h1 className={styles.title}>Products</h1>
      <p className={styles.subtitle}>Fix a product&rsquo;s category when the AI classifier gets it wrong, or add tags manually. Manual saves are never overwritten by the automated classifier.</p>

      {saved ? <p className={styles.notice}>Saved.</p> : null}

      <form action="/admin/products" className={styles.searchBar}>
        <input type="text" name="q" defaultValue={q} placeholder="Search by product title..." />
        <select name="brand" defaultValue={brandParam ?? ""}>
          <option value="">All brands</option>
          {[...brands].sort((a, b) => a.name.localeCompare(b.name)).map((brand) => <option key={brand.slug} value={brand.slug}>{brand.name}</option>)}
        </select>
        <select name="status" defaultValue={status}>
          {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <button type="submit">Search</button>
      </form>

      <p className={styles.rowMeta} style={{ marginBottom: 14 }}>{products.length} product{products.length === 1 ? "" : "s"} shown (max 30 — search to narrow further).</p>

      <div className={styles.rowList}>
        {products.map((product) => (
          <details key={product.id} className={styles.row}>
            <summary className={styles.rowSummary}>
              <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {product.primary_image_url ? <img src={product.primary_image_url} alt="" style={{ width: 40, height: 40, objectFit: "contain", background: "#f4f3ee" }} /> : null}
                <span>
                  <strong>{product.title}</strong>
                  <span className={styles.rowMeta} style={{ display: "block" }}>{product.brands?.name ?? "Unknown brand"} · ${Number(product.price).toFixed(2)}{product.stock_status === "sold_out" ? " · Sold out" : ""}</span>
                </span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {product.is_hidden ? <span className={styles.pill}>Hidden</span> : null}
                <span className={styles.pill}>{product.classification_status.replace("_", " ")}</span>
              </span>
            </summary>
            <div className={styles.rowBody}>
              <p className={styles.rowMeta} style={{ marginBottom: 12 }}>
                Currently: {[product.street_group, product.street_category, product.street_type, product.street_detail].filter(Boolean).join(" / ") || "Not classified"}
                {product.street_activity ? ` · ${product.street_activity}` : ""}
              </p>
              <form action={updateProductTaxonomy} className={styles.form}>
                <input type="hidden" name="product_id" value={product.id} />
                <input type="hidden" name="return_to" value={returnTo} />
                <TaxonomyPicker
                  idPrefix={product.id}
                  initialGroup={product.street_group ?? undefined}
                  initialCategory={product.street_category ?? undefined}
                  initialType={product.street_type ?? undefined}
                  initialDetail={product.street_detail ?? undefined}
                  initialActivity={product.street_activity ?? undefined}
                />
                <div className={styles.field}>
                  <label htmlFor={`${product.id}-tags`}>Tags (comma-separated)</label>
                  <textarea id={`${product.id}-tags`} name="street_tags" defaultValue={(product.street_tags ?? []).join(", ")} />
                </div>
                <button type="submit" className={styles.button}>Save product</button>
              </form>
              <div className={styles.actions} style={{ marginTop: 14, borderTop: "1px solid rgba(16,16,16,.12)", paddingTop: 14 }}>
                <form action={hideProduct}>
                  <input type="hidden" name="product_id" value={product.id} />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <input type="hidden" name="hidden" value={product.is_hidden ? "false" : "true"} />
                  <button type="submit" className={styles.buttonSecondary}>{product.is_hidden ? "Unhide (show on site)" : "Hide from site"}</button>
                </form>
                <form action={deleteProduct}>
                  <input type="hidden" name="product_id" value={product.id} />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <ConfirmSubmitButton confirmText={`Permanently delete "${product.title}"? This can't be undone.`} className={styles.buttonSecondary} style={{ color: "#a4302a", borderColor: "#a4302a" }}>
                    Delete permanently
                  </ConfirmSubmitButton>
                </form>
              </div>
            </div>
          </details>
        ))}
        {!products.length ? <p className={styles.rowMeta}>No products match this search/filter.</p> : null}
      </div>
    </div>
  );
}
