import Link from "next/link";
import { after } from "next/server";
import { Header, ProductCard } from "@/components/storefront";
import { PriceRangeSlider } from "@/components/price-slider";
import { STREET_BRANDS } from "@/lib/brands";
import { getCatalog, type StreetProduct } from "@/lib/catalog";
import { CATALOG_PAGE_SIZE, getCatalogPage } from "@/lib/catalog-page";
import { STREET_TAXONOMY, categoriesForGroup, typesForCategory } from "@/lib/street-taxonomy";
import { logSiteEvent } from "@/lib/analytics";

// This route reads `searchParams`, so Next always renders it per-request —
// no explicit `dynamic`/`revalidate` override needed. The underlying Supabase
// fetches are still cached (see lib/supabase-rest.ts), so repeat views of the
// same filter combination reuse cached data instead of re-querying every time.

type Params = {
  q?: string;
  brand?: string;
  // Street taxonomy filters (lib/street-taxonomy.ts): group -> category -> type.
  group?: string;
  category?: string;
  type?: string;
  color?: string;
  size?: string;
  availability?: string;
  min?: string;
  max?: string;
  sort?: string;
  page?: string;
};

// Raw scraped color values (products.colors) that shoppers can filter by.
// Kept distinct from the AI-assigned STREET_COLORS facet in
// lib/street-taxonomy.ts, since this list has to match what source-import.ts
// actually detects from brand catalogs.
const COLOR_SWATCHES: Record<string, string> = {
  black: "#101010",
  white: "#ffffff",
  gray: "#9c9a94",
  grey: "#9c9a94",
  blue: "#3b5b92",
  navy: "#1f2a44",
  green: "#4a5d3a",
  army: "#5b5a3f",
  brown: "#6b4a35",
  tan: "#c9b291",
  cream: "#f0e6d2",
  red: "#a4302a",
  purple: "#5b4178",
  yellow: "#d9b23c",
  pink: "#d998ab",
  camo: "linear-gradient(135deg,#4b5320 25%,#736c46 25% 50%,#2f331d 50% 75%,#5b5a3f 75%)",
};
const colors = Object.keys(COLOR_SWATCHES);
const LIGHT_SWATCHES = new Set(["white", "cream", "tan", "yellow"]);

// Groups shown expanded by default (no filter selected yet) — mirrors GOAT
// defaulting to its two biggest departments open in the sidebar.
const DEFAULT_OPEN_GROUPS = new Set(["Footwear", "Apparel", "Collectibles"]);

// Sizing is category-relative (a sneaker size means nothing on a t-shirt), so
// the size filter only appears once a group/category narrows what "size"
// should mean, and shows a set appropriate to that department. Product data
// itself is still whatever free-form sizes the brand provided (products.sizes)
// — this only controls which options are offered as quick filters.
const BOTTOMS_WAIST_CATEGORIES = new Set(["Jeans", "Pants", "Shorts", "Sweatpants", "Trousers", "Joggers", "Skirts"]);
function sizeOptionsForFilter(group?: string, category?: string): string[] | null {
  if (!group) return null;
  if (group === "Footwear") return ["4", "4.5", "5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "11.5", "12", "13", "14"];
  if (category && BOTTOMS_WAIST_CATEGORIES.has(category)) return ["26", "28", "29", "30", "31", "32", "33", "34", "36", "38", "40", "42"];
  if (group === "Apparel") return ["XXS", "XS", "S", "M", "L", "XL", "XXL"];
  if (category === "Hats") return ["S/M", "L/XL", "One Size"];
  return ["One Size"];
}

function numberOrUndefined(value: string | undefined) {
  if (!value?.trim()) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function catalogHref(params: Params, page: number) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key !== "page" && value) search.set(key, value);
  }
  if (page > 1) search.set("page", String(page));
  const query = search.toString();
  return query ? `/catalog?${query}` : "/catalog";
}

/** Toggle-style href for a single filter key: click to set it, click again (same value) to clear it. Always resets pagination. */
function toggleHref(params: Params, key: "color" | "size", value: string) {
  const next: Params = { ...params, page: undefined, [key]: params[key] === value ? undefined : value };
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v) search.set(k, v);
  const query = search.toString();
  return query ? `/catalog?${query}` : "/catalog";
}

function clearParamHref(params: Params, key: keyof Params) {
  return catalogHref({ ...params, [key]: undefined }, 1);
}

/**
 * Href for a sidebar category link. Every link carries its full ancestor
 * chain (a type link sets group+category+type, not just type) so the URL is
 * always self-consistent even though category/type names happen to be
 * unique across the whole taxonomy. Clicking the already-active leaf toggles
 * it off and collapses back to its parent level, instead of re-selecting it
 * — the same "click to filter, click again to clear" pattern GOAT's own
 * category sidebar uses.
 */
function sidebarHref(params: Params, target: { group: string; category?: string; type?: string }) {
  const next: Params = { ...params, page: undefined };
  if (target.type !== undefined) {
    const isActive = params.type === target.type;
    next.group = target.group;
    next.category = target.category;
    next.type = isActive ? undefined : target.type;
  } else if (target.category !== undefined) {
    const isActive = params.category === target.category && !params.type;
    next.group = target.group;
    next.category = isActive ? undefined : target.category;
    next.type = undefined;
  } else {
    const isActive = params.group === target.group && !params.category && !params.type;
    next.group = isActive ? undefined : target.group;
    next.category = undefined;
    next.type = undefined;
  }
  // A group/category change can invalidate the previously-selected size
  // (e.g. leaving Footwear should drop a shoe size), so size is cleared
  // whenever the taxonomy selection changes.
  next.size = undefined;
  const search = new URLSearchParams();
  for (const [key, val] of Object.entries(next)) if (val) search.set(key, val);
  const query = search.toString();
  return query ? `/catalog?${query}` : "/catalog";
}

function clearCategoryHref(params: Params) {
  return catalogHref({ ...params, group: undefined, category: undefined, type: undefined, size: undefined }, 1);
}

/** GOAT-style nested category sidebar, driven entirely by STREET_TAXONOMY. */
function CategorySidebar({ params }: { params: Params }) {
  const groups = Object.keys(STREET_TAXONOMY);
  const hasFilter = Boolean(params.group || params.category || params.type);

  return (
    <nav className="sidebar" aria-label="Shop by category">
      <div className="sidebar-head">
        <p className="sidebar-heading">Category</p>
        {hasFilter ? <Link href={clearCategoryHref(params)} className="sidebar-reset">Reset</Link> : null}
      </div>
      {hasFilter ? (
        <p className="sidebar-breadcrumb">{[params.group, params.category, params.type].filter(Boolean).join(" / ")}</p>
      ) : null}
      {groups.map((group) => {
        const categoriesInGroup = categoriesForGroup(group);
        const isGroupActive = params.group === group && !params.category && !params.type;
        const isOpen = params.group === group || (!params.group && DEFAULT_OPEN_GROUPS.has(group));
        return (
          <details key={group} className="sidebar-group" open={isOpen}>
            <summary>
              <Link href={sidebarHref(params, { group })} className={isGroupActive ? "active" : undefined}>{group}</Link>
            </summary>
            <ul>
              {categoriesInGroup.map((category) => {
                const typesInCategory = typesForCategory(group, category);
                const isCategoryActive = params.category === category && !params.type;
                return (
                  <li key={category}>
                    <Link href={sidebarHref(params, { group, category })} className={isCategoryActive ? "active" : undefined}>{category}</Link>
                    {typesInCategory.length ? (
                      <ul className="sidebar-types">
                        {typesInCategory.map((type) => (
                          <li key={type}>
                            <Link href={sidebarHref(params, { group, category, type })} className={params.type === type ? "active" : undefined}>{type}</Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </nav>
  );
}

function ColorSwatches({ params }: { params: Params }) {
  return (
    <div className="filter-block">
      <p className="filter-block-label">Color</p>
      <div className="color-swatches">
        {colors.map((value) => (
          <Link
            key={value}
            href={toggleHref(params, "color", value)}
            className={`color-swatch${params.color === value ? " active" : ""}`}
            style={{ background: COLOR_SWATCHES[value] }}
            data-light={LIGHT_SWATCHES.has(value) ? "true" : undefined}
            title={value}
            aria-label={`Filter by ${value}`}
          />
        ))}
      </div>
    </div>
  );
}

function SizeChips({ params }: { params: Params }) {
  const options = sizeOptionsForFilter(params.group, params.category);
  if (!options) return null;
  return (
    <div className="filter-block">
      <p className="filter-block-label">{params.group === "Footwear" ? "Shoe size" : "Size"}</p>
      <div className="size-options">
        {options.map((value) => (
          <Link key={value} href={toggleHref(params, "size", value)} className={`size-chip${params.size === value ? " active" : ""}`}>{value}</Link>
        ))}
      </div>
    </div>
  );
}

function fallbackFilter(products: StreetProduct[], params: Params) {
  const query = (params.q ?? "").trim().toLowerCase();
  const min = numberOrUndefined(params.min) ?? 0;
  const max = numberOrUndefined(params.max) ?? Number.MAX_SAFE_INTEGER;
  let filtered = products.filter((product) => {
    const searchable = `${product.title} ${product.brandName} ${product.category} ${product.colors.join(" ")} ${product.sizes.join(" ")} ${product.tags.join(" ")}`.toLowerCase();
    return (!query || searchable.includes(query))
      && (!params.brand || product.brandSlug === params.brand)
      && (!params.group || product.streetGroup === params.group)
      && (!params.category || product.streetCategory === params.category)
      && (!params.type || product.streetType === params.type)
      && (!params.color || product.colors.some((color) => color.toLowerCase() === params.color?.toLowerCase()))
      && (!params.size || product.sizes.includes(params.size))
      && (params.availability === "all" || !params.availability || product.stockStatus === "in_stock")
      && product.price >= min
      && product.price <= max;
  });
  if (params.sort === "price-low") filtered = [...filtered].sort((a, b) => a.price - b.price);
  if (params.sort === "price-high") filtered = [...filtered].sort((a, b) => b.price - a.price);
  return filtered;
}

export default async function CatalogPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const requestedPage = Math.max(1, Math.floor(Number(params.page) || 1));
  const databasePage = await getCatalogPage({
    page: requestedPage,
    q: params.q,
    brand: params.brand,
    group: params.group,
    category: params.category,
    type: params.type,
    color: params.color,
    size: params.size,
    availability: params.availability,
    min: numberOrUndefined(params.min),
    max: numberOrUndefined(params.max),
    sort: params.sort,
  });

  let products: StreetProduct[];
  let total: number;
  let currentPage = requestedPage;
  let sourceLabel: string;

  if (databasePage) {
    products = databasePage.products;
    total = databasePage.total;
    sourceLabel = "Saved Street catalog";
  } else {
    const catalog = await getCatalog();
    const filtered = fallbackFilter(catalog.products, params);
    total = filtered.length;
    currentPage = Math.min(requestedPage, Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE)));
    products = filtered.slice((currentPage - 1) * CATALOG_PAGE_SIZE, currentPage * CATALOG_PAGE_SIZE);
    sourceLabel = catalog.source === "live" ? "Live source import — initial database sync pending" : "Source is temporarily unavailable; showing backup data.";
  }

  // Analytics: log the search/browse after the response is sent, so tracking
  // never adds latency to the page itself (see lib/analytics.ts).
  after(async () => {
    if (params.q?.trim()) {
      await logSiteEvent({ eventType: "search", query: params.q.trim(), resultsCount: total, path: "/catalog" });
    } else if (params.group) {
      await logSiteEvent({ eventType: "category_view", streetGroup: params.group, streetCategory: params.category, path: "/catalog" });
    }
  });

  const totalPages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
  const firstPiece = total ? (currentPage - 1) * CATALOG_PAGE_SIZE + 1 : 0;
  const lastPiece = Math.min(currentPage * CATALOG_PAGE_SIZE, total);
  const brandOptions = [...STREET_BRANDS].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main>
      <Header />
      <div className="shell">
        <div className="catalog-top">
          <div><p className="eyebrow" style={{ color: "rgba(16,16,16,.55)" }}>Street catalog</p><h1>Shop all</h1></div>
          <p className="results">
            Showing {firstPiece}–{lastPiece} of {total.toLocaleString()} pieces<br />
            {params.q ? <>Results for &ldquo;{params.q}&rdquo; · <Link className="link-small" href={clearParamHref(params, "q")}>Clear search</Link></> : sourceLabel}
          </p>
        </div>
        <div className="catalog-layout">
          <CategorySidebar params={params} />
          <div>
            <form className="filters" action="/catalog">
              <input type="hidden" name="q" value={params.q ?? ""} />
              <select name="brand" defaultValue={params.brand ?? ""}><option value="">Brand</option>{brandOptions.map((brand) => <option value={brand.slug} key={brand.slug}>{brand.name}</option>)}</select>
              <select name="availability" defaultValue={params.availability ?? "in_stock"}><option value="in_stock">In stock</option><option value="all">Include sold out</option></select>
              <select name="sort" defaultValue={params.sort ?? ""}><option value="">Newest</option><option value="price-low">Price: low</option><option value="price-high">Price: high</option></select>
              <button type="submit">Apply</button>
              {/* Preserve the sidebar's taxonomy selection when the top filter form is submitted. */}
              <input type="hidden" name="group" value={params.group ?? ""} />
              <input type="hidden" name="category" value={params.category ?? ""} />
              <input type="hidden" name="type" value={params.type ?? ""} />
              <input type="hidden" name="color" value={params.color ?? ""} />
              <input type="hidden" name="size" value={params.size ?? ""} />
            </form>

            <div className="filter-block">
              <p className="filter-block-label">Price</p>
              <PriceRangeSlider initialMin={numberOrUndefined(params.min)} initialMax={numberOrUndefined(params.max)} />
              <noscript>
                <form className="filters" action="/catalog" style={{ marginTop: 8, gridTemplateColumns: "1fr 1fr auto" }}>
                  <input name="min" type="number" min="0" defaultValue={params.min} placeholder="Min price" />
                  <input name="max" type="number" min="0" defaultValue={params.max} placeholder="Max price" />
                  <button type="submit">Price range</button>
                  <input type="hidden" name="group" value={params.group ?? ""} />
                  <input type="hidden" name="category" value={params.category ?? ""} />
                  <input type="hidden" name="type" value={params.type ?? ""} />
                </form>
              </noscript>
            </div>

            <ColorSwatches params={params} />
            <SizeChips params={params} />

            {products.length ? (
              <div className="grid">{products.map((product) => <ProductCard key={product.id} product={product} searchQuery={params.q} />)}</div>
            ) : (
              <div className="empty"><p>No pieces match those filters.</p><a className="link-small" href="/catalog">Reset filters</a></div>
            )}
            {total > CATALOG_PAGE_SIZE ? <nav aria-label="Catalog pages" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "28px 0 12px", fontSize: 12 }}>
              {currentPage > 1 ? <Link className="link-small" href={catalogHref(params, currentPage - 1)}>← Previous</Link> : <span />}
              <span>Page {currentPage} of {totalPages}</span>
              {currentPage < totalPages ? <Link className="link-small" href={catalogHref(params, currentPage + 1)}>Next →</Link> : <span />}
            </nav> : null}
          </div>
        </div>
      </div>
    </main>
  );
}
