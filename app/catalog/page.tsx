import Link from "next/link";
import { Header, ProductCard } from "@/components/storefront";
import { STREET_BRANDS } from "@/lib/brands";
import { getCatalog, type StreetProduct } from "@/lib/catalog";
import { CATALOG_PAGE_SIZE, getCatalogPage } from "@/lib/catalog-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { q?: string; brand?: string; category?: string; color?: string; size?: string; availability?: string; min?: string; max?: string; sort?: string; page?: string };

const categories = ["Accessories", "Decals", "Denim", "Hoodies & Sweatshirts", "Outerwear", "Pants", "Shorts", "T-Shirts", "Tops", "Other"];
const colors = ["black", "white", "gray", "grey", "blue", "navy", "green", "army", "brown", "tan", "cream", "red", "purple", "yellow", "pink", "camo"];
const sizes = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "28", "30", "32", "34", "36", "38", "40", "One Size"];

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

function fallbackFilter(products: StreetProduct[], params: Params) {
  const query = (params.q ?? "").trim().toLowerCase();
  const min = numberOrUndefined(params.min) ?? 0;
  const max = numberOrUndefined(params.max) ?? Number.MAX_SAFE_INTEGER;
  let filtered = products.filter((product) => {
    const searchable = `${product.title} ${product.brandName} ${product.category} ${product.colors.join(" ")} ${product.sizes.join(" ")} ${product.tags.join(" ")}`.toLowerCase();
    return (!query || searchable.includes(query))
      && (!params.brand || product.brandSlug === params.brand)
      && (!params.category || product.category === params.category)
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
    category: params.category,
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

  const totalPages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
  const firstPiece = total ? (currentPage - 1) * CATALOG_PAGE_SIZE + 1 : 0;
  const lastPiece = Math.min(currentPage * CATALOG_PAGE_SIZE, total);
  const brandOptions = [...STREET_BRANDS].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main>
      <Header />
      <div className="shell">
        <div className="catalog-top"><div><p className="eyebrow" style={{ color: "rgba(16,16,16,.55)" }}>Street catalog</p><h1>Shop all</h1></div><p className="results">Showing {firstPiece}–{lastPiece} of {total.toLocaleString()} pieces<br />{sourceLabel}</p></div>
        <form className="filters" action="/catalog">
          <input name="q" defaultValue={params.q} placeholder="Search products, styles, brands..." />
          <select name="brand" defaultValue={params.brand ?? ""}><option value="">Brand</option>{brandOptions.map((brand) => <option value={brand.slug} key={brand.slug}>{brand.name}</option>)}</select>
          <select name="category" defaultValue={params.category ?? ""}><option value="">Category</option>{categories.map((value) => <option key={value}>{value}</option>)}</select>
          <select name="color" defaultValue={params.color ?? ""}><option value="">Color</option>{colors.map((value) => <option key={value}>{value}</option>)}</select>
          <select name="size" defaultValue={params.size ?? ""}><option value="">Size</option>{sizes.map((value) => <option key={value}>{value}</option>)}</select>
          <select name="availability" defaultValue={params.availability ?? "in_stock"}><option value="in_stock">In stock</option><option value="all">Include sold out</option></select>
          <select name="sort" defaultValue={params.sort ?? ""}><option value="">Newest</option><option value="price-low">Price: low</option><option value="price-high">Price: high</option></select>
          <button type="submit">Apply</button>
        </form>
        <form className="filters" action="/catalog" style={{ marginTop: 8, gridTemplateColumns: "1fr 1fr auto" }}>
          <input name="min" type="number" min="0" defaultValue={params.min} placeholder="Min price" />
          <input name="max" type="number" min="0" defaultValue={params.max} placeholder="Max price" />
          <button type="submit">Price range</button>
        </form>
        {products.length ? <div className="grid">{products.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="empty"><p>No pieces match those filters.</p><a className="link-small" href="/catalog">Reset filters</a></div>}
        {total > CATALOG_PAGE_SIZE ? <nav aria-label="Catalog pages" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "28px 0 12px", fontSize: 12 }}>
          {currentPage > 1 ? <Link className="link-small" href={catalogHref(params, currentPage - 1)}>← Previous</Link> : <span />}
          <span>Page {currentPage} of {totalPages}</span>
          {currentPage < totalPages ? <Link className="link-small" href={catalogHref(params, currentPage + 1)}>Next →</Link> : <span />}
        </nav> : null}
      </div>
    </main>
  );
}
