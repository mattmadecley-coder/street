import Link from "next/link";
import styles from "@/app/admin/admin.module.css";
import { TaxonomyPicker } from "@/components/admin/taxonomy-picker";
import { supabaseRestPage } from "@/lib/supabase-rest";
import { getAllBrands } from "@/lib/catalog-store";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { SubmitButton } from "@/components/admin/submit-button";
import { ScrollMemory } from "@/components/admin/scroll-memory";
import { updateProductTaxonomy, hideProduct, deleteProduct, restoreProduct, purgeProduct } from "./actions";
import { can } from "@/lib/admin-permissions";
import { trashSupported, TRASH_RETENTION_DAYS } from "@/lib/trash";
import { Banner } from "@/components/admin/ui";
import { BulkBar, BULK_FORM_ID } from "@/components/admin/bulk-bar";
import { requireUser } from "@/lib/admin-guard";
import { loadSavedFilters, filterHref, cleanFilterParams } from "@/lib/saved-filters";
import { STREET_TAXONOMY } from "@/lib/street-taxonomy";
import { saveFilterViewAction, deleteFilterViewAction } from "./actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

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
  classification_pass: number | null;
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

type ExtraFilters = { group?: string; stock?: string; min?: string; max?: string };

function productsPath(q: string | undefined, status: string, brandSlug: string | undefined, trashOn: boolean, extra: ExtraFilters = {}) {
  const params = new URLSearchParams();
  params.set("select", "id,title,price,primary_image_url,street_group,street_category,street_type,street_detail,street_activity,street_tags,classification_status,classification_pass,is_hidden,stock_status,brands!inner(slug,name)");
  params.set("is_active", "eq.true");
  params.set("order", "updated_at.desc");
  if (status === "trash") params.set("deleted_at", "not.is.null");
  else {
    if (status !== "all") params.set("classification_status", `eq.${status}`);
    if (trashOn) params.set("deleted_at", "is.null");
  }
  if (q?.trim()) params.set("title", `ilike.*${q.trim().replace(/[%,()]/g, " ")}*`);
  if (brandSlug) params.set("brands.slug", `eq.${brandSlug}`);
  if (extra.group && extra.group in STREET_TAXONOMY) params.set("street_group", `eq.${extra.group}`);
  if (extra.stock === "in_stock" || extra.stock === "sold_out") params.set("stock_status", `eq.${extra.stock}`);
  const priceFilters: string[] = [];
  if (extra.min && Number.isFinite(Number(extra.min)) && Number(extra.min) >= 0) priceFilters.push(`price.gte.${Number(extra.min)}`);
  if (extra.max && Number.isFinite(Number(extra.max)) && Number(extra.max) >= 0) priceFilters.push(`price.lte.${Number(extra.max)}`);
  if (priceFilters.length) params.set("and", `(${priceFilters.join(",")})`);
  return `products?${params.toString()}`;
}

/** Paginated instead of a flat 30-row cap — the review queue can run well past 30 items, and the old version made everything past the newest 30 invisible with no way to page to it. */
async function searchProducts(q: string | undefined, status: string, brandSlug: string | undefined, requestedPage: number, trashOn: boolean, extra: ExtraFilters): Promise<{ products: AdminProductRow[]; total: number; page: number }> {
  const path = productsPath(q, status, brandSlug, trashOn, extra);
  try {
    let page = requestedPage;
    let from = (page - 1) * PAGE_SIZE;
    let result = await supabaseRestPage<AdminProductRow>(path, { from, to: from + PAGE_SIZE - 1 }, { noStore: true });
    const lastPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
    if (result.total > 0 && page > lastPage) {
      page = lastPage;
      from = (page - 1) * PAGE_SIZE;
      result = await supabaseRestPage<AdminProductRow>(path, { from, to: from + PAGE_SIZE - 1 }, { noStore: true });
    }
    return { products: result.data, total: result.total, page };
  } catch (error) {
    console.error("Street admin product search failed", error);
    return { products: [], total: 0, page: 1 };
  }
}

function productsHref(q: string | undefined, status: string, brandSlug: string | undefined, page: number, extra: ExtraFilters = {}) {
  const search = new URLSearchParams();
  search.set("status", status);
  if (extra.group) search.set("group", extra.group);
  if (extra.stock) search.set("stock", extra.stock);
  if (extra.min) search.set("min", extra.min);
  if (extra.max) search.set("max", extra.max);
  if (brandSlug) search.set("brand", brandSlug);
  if (q) search.set("q", q);
  if (page > 1) search.set("page", String(page));
  return `/admin/products?${search.toString()}`;
}

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; brand?: string; saved?: string; page?: string; bulkError?: string; group?: string; stock?: string; min?: string; max?: string; view?: string }> }) {
  const principal = await requireUser();
  const trashOn = await trashSupported();
  const canWrite = can(principal.role, "catalog.write");
  const canDelete = can(principal.role, "catalog.delete");
  const canPurge = can(principal.role, "catalog.purge");
  const { q, status: statusParam, brand: brandParam, saved, page: pageParam, bulkError, group: groupParam, stock: stockParam, min: minParam, max: maxParam, view } = await searchParams;
  const extra: ExtraFilters = { group: groupParam, stock: stockParam, min: minParam, max: maxParam };
  const status = statusParam ?? "needs_review";
  const requestedPage = Math.max(1, Math.floor(Number(pageParam) || 1));
  const [{ products, total, page: currentPage }, brands, savedViews] = await Promise.all([searchProducts(q, status, brandParam, requestedPage, trashOn, extra), getAllBrands(), loadSavedFilters()]);
  const currentParams = cleanFilterParams({ status: status === "needs_review" ? "" : status, brand: brandParam, q, group: groupParam, stock: stockParam, min: minParam, max: maxParam });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const returnTo = productsHref(q, status, brandParam, currentPage, extra);

  return (
    <div>
      <h1 className={styles.title}>Products</h1>
      <p className={styles.subtitle}>Fix a product&rsquo;s category when the AI classifier gets it wrong, or add tags manually. Manual saves are never overwritten by the automated classifier.</p>
      {status === "trash" ? <Banner tone="info">Deleted products stay here for {TRASH_RETENTION_DAYS} days so they can be restored. They are hidden from the site.{canPurge ? "" : " Only an owner can delete them permanently."}</Banner> : null}
      {!canWrite ? <Banner tone="info">You have view-only access to products.</Banner> : null}
      {bulkError ? <p className={styles.noticeError} role="alert">{bulkError}</p> : null}
      <form action="/admin/products" className={styles.searchBar}>
        <input type="text" name="q" defaultValue={q} placeholder="Search by product title..." />
        <select name="brand" defaultValue={brandParam ?? ""}>
          <option value="">All brands</option>
          {[...brands].sort((a, b) => a.name.localeCompare(b.name)).map((brand) => <option key={brand.slug} value={brand.slug}>{brand.name}</option>)}
        </select>
        <select name="status" defaultValue={status}>
          {(trashOn ? [...STATUS_OPTIONS, { value: "trash", label: "Trash" }] : STATUS_OPTIONS).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <select name="group" defaultValue={groupParam ?? ""} aria-label="Group">
          <option value="">Any group</option>
          {Object.keys(STREET_TAXONOMY).map((group) => <option key={group} value={group}>{group}</option>)}
        </select>
        <select name="stock" defaultValue={stockParam ?? ""} aria-label="Availability">
          <option value="">Any availability</option>
          <option value="in_stock">In stock</option>
          <option value="sold_out">Sold out</option>
        </select>
        <input type="number" name="min" min="0" step="0.01" defaultValue={minParam ?? ""} placeholder="Min $" aria-label="Lowest price" style={{ width: 90 }} />
        <input type="number" name="max" min="0" step="0.01" defaultValue={maxParam ?? ""} placeholder="Max $" aria-label="Highest price" style={{ width: 90 }} />
        <button type="submit">Search</button>
      </form>

      {savedViews.available ? (
        <div className="u-row" style={{ flexWrap: "wrap", gap: 8, margin: "0 0 14px" }} aria-label="Saved views">
          {savedViews.filters.map((filter) => (
            <span key={filter.id} className="u-row" style={{ gap: 4 }}>
              <Link className={styles.pill} href={filterHref(filter)}>{filter.name}</Link>
              {canWrite ? (
                <form action={deleteFilterViewAction}>
                  <input type="hidden" name="id" value={filter.id} />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <button type="submit" className="link-small" aria-label={`Delete saved view ${filter.name}`} title="Delete this view">×</button>
                </form>
              ) : null}
            </span>
          ))}
          {canWrite && Object.keys(currentParams).length ? (
            <form action={saveFilterViewAction} className="u-row" style={{ gap: 6 }}>
              {Object.entries(currentParams).map(([key, value]) => <input key={key} type="hidden" name={`p_${key}`} value={value} />)}
              <input type="text" name="name" placeholder="Name this view" maxLength={60} required aria-label="Name for this saved view" />
              <SubmitButton pendingText="Saving…" className={styles.buttonSecondary}>Save view</SubmitButton>
            </form>
          ) : null}
        </div>
      ) : null}
      {view === "saved" ? <Banner tone="success">View saved.</Banner> : null}
      {view && view !== "saved" && view !== "deleted" ? <p className={styles.noticeError} role="alert">{view}</p> : null}

      <p className={`${styles.rowMeta} u-mb-14`}>{total.toLocaleString()} product{total === 1 ? "" : "s"} match — showing {products.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–{(currentPage - 1) * PAGE_SIZE + products.length} (page {currentPage} of {totalPages}).</p>

      {status !== "trash" ? <BulkBar returnTo={returnTo} canWrite={canWrite} canDelete={canDelete} trashOn={trashOn} showApprove={status === "needs_review" || status === "all"} /> : null}

      <ScrollMemory>
      <div className={styles.rowList}>
        {products.map((product) => (
          <details key={product.id} data-scroll-id={product.id} className={styles.row}>
            <summary className={styles.rowSummary}>
              <span className="u-row-12">
                {canWrite && status !== "trash" ? <input type="checkbox" data-bulk="" form={BULK_FORM_ID} name="ids" value={product.id} aria-label={`Select ${product.title}`} className="adm-bulk-check" /> : null}
                {product.primary_image_url ? <img src={product.primary_image_url} alt="" className={styles.productThumb} /> : null}
                <span>
                  <strong>{product.title}</strong>
                  <span className={`${styles.rowMeta} u-block`}>{product.brands?.name ?? "Unknown brand"} · ${Number(product.price).toFixed(2)}{product.stock_status === "sold_out" ? " · Sold out" : ""}</span>
                </span>
              </span>
              <span className="u-row">
                {product.is_hidden ? <span className={styles.pill}>Hidden</span> : null}
                <span className={styles.pill}>{product.classification_status.replace("_", " ")}</span>
                {product.classification_status !== "pending" ? <span className={styles.pill} title={product.classification_pass === 2 ? "Decided by the 2nd classifier (3 candidates, picked the best)" : "Decided by the 1st classifier"}>{product.classification_pass === 2 ? "2nd pass" : "1st pass"}</span> : null}
              </span>
            </summary>
            <div className={styles.rowBody}>
              <p className={`${styles.rowMeta} u-mb-12`}>
                Currently: {[product.street_group, product.street_category, product.street_type, product.street_detail].filter(Boolean).join(" / ") || "Not classified"}
                {product.street_activity ? ` · ${product.street_activity}` : ""}
              </p>
              {status === "trash" ? (
                <div className={`${styles.actions} ${styles.rowActionsDivided}`}>
                  {canDelete ? (
                    <form action={restoreProduct}>
                      <input type="hidden" name="product_id" value={product.id} />
                      <input type="hidden" name="return_to" value={returnTo} />
                      <SubmitButton pendingText="Restoring…" className={styles.button}>Restore to the site</SubmitButton>
                    </form>
                  ) : null}
                  {canPurge ? (
                    <form action={purgeProduct}>
                      <input type="hidden" name="product_id" value={product.id} />
                      <input type="hidden" name="return_to" value={returnTo} />
                      <ConfirmSubmitButton confirmText={`Permanently delete "${product.title}" and its images and variants? This can't be undone.`} className={`${styles.buttonSecondary} ${styles.dangerText}`} confirmTitle="Delete permanently?" confirmLabel="Delete permanently" danger>
                        Delete permanently
                      </ConfirmSubmitButton>
                    </form>
                  ) : null}
                </div>
              ) : canWrite ? (
                <>
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
                    <SubmitButton pendingText="Saving…" className={styles.button}>Save product</SubmitButton>
                  </form>
                  <div className={`${styles.actions} ${styles.rowActionsDivided}`}>
                    <form action={hideProduct}>
                      <input type="hidden" name="product_id" value={product.id} />
                      <input type="hidden" name="return_to" value={returnTo} />
                      <input type="hidden" name="hidden" value={product.is_hidden ? "false" : "true"} />
                      <SubmitButton pendingText="Saving…" className={styles.buttonSecondary}>{product.is_hidden ? "Unhide (show on site)" : "Hide from site"}</SubmitButton>
                    </form>
                    {canDelete ? (
                      <form action={deleteProduct}>
                        <input type="hidden" name="product_id" value={product.id} />
                        <input type="hidden" name="return_to" value={returnTo} />
                        <ConfirmSubmitButton
                          confirmText={trashOn ? `Move "${product.title}" to the trash? It is hidden from the site and can be restored within ${TRASH_RETENTION_DAYS} days.` : `Permanently delete "${product.title}"? This can't be undone.`}
                          className={`${styles.buttonSecondary} ${styles.dangerText}`}
                          confirmTitle={trashOn ? "Move to trash?" : "Delete this product?"}
                          confirmLabel={trashOn ? "Move to trash" : "Delete permanently"}
                          danger
                        >
                          {trashOn ? "Move to trash" : "Delete permanently"}
                        </ConfirmSubmitButton>
                      </form>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          </details>
        ))}
        {!products.length ? <p className={styles.rowMeta}>No products match this search/filter.</p> : null}
      </div>
      </ScrollMemory>
      {totalPages > 1 ? (
        <nav aria-label="Product pages" className={styles.pager}>
          {currentPage > 1 ? <Link className="link-small" href={productsHref(q, status, brandParam, currentPage - 1, extra)}>← Previous</Link> : <span />}
          <span className={styles.rowMeta}>Page {currentPage} of {totalPages}</span>
          {currentPage < totalPages ? <Link className="link-small" href={productsHref(q, status, brandParam, currentPage + 1, extra)}>Next →</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
