import { Header, ProductCard } from "@/components/storefront";
import { getCatalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { q?: string; brand?: string; category?: string; color?: string; size?: string; availability?: string; min?: string; max?: string; sort?: string };

export default async function CatalogPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const { products, source } = await getCatalog();
  const query = (params.q ?? "").trim().toLowerCase();
  const min = Number(params.min || 0);
  const max = Number(params.max || Number.MAX_SAFE_INTEGER);
  const brands = [...new Map(products.map((product) => [product.brandSlug, product.brandName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const categories = [...new Set(products.map((product) => product.category))].sort();
  const colors = [...new Set(products.flatMap((product) => product.colors))].sort();
  const sizes = [...new Set(products.flatMap((product) => product.sizes))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  let filtered = products.filter((product) => {
    const searchable = `${product.title} ${product.brandName} ${product.category} ${product.colors.join(" ")} ${product.sizes.join(" ")} ${product.tags.join(" ")}`.toLowerCase();
    const matchesQuery = !query || searchable.includes(query);
    const matchesBrand = !params.brand || product.brandSlug === params.brand;
    const matchesCategory = !params.category || product.category === params.category;
    const matchesColor = !params.color || product.colors.some((color) => color.toLowerCase() === params.color?.toLowerCase());
    const matchesSize = !params.size || product.sizes.includes(params.size);
    const matchesAvailability = params.availability === "all" || !params.availability || product.stockStatus === "in_stock";
    const matchesPrice = product.price >= min && product.price <= max;
    return matchesQuery && matchesBrand && matchesCategory && matchesColor && matchesSize && matchesAvailability && matchesPrice;
  });

  if (params.sort === "price-low") filtered = [...filtered].sort((a, b) => a.price - b.price);
  if (params.sort === "price-high") filtered = [...filtered].sort((a, b) => b.price - a.price);

  const sourceLabel = source === "database" ? "Saved Street catalog" : source === "live" ? "Live source import — initial database sync pending" : "Source is temporarily unavailable; showing backup data.";

  return (
    <main>
      <Header />
      <div className="shell">
        <div className="catalog-top"><div><p className="eyebrow" style={{ color: "rgba(16,16,16,.55)" }}>Street catalog</p><h1>Shop all</h1></div><p className="results">{filtered.length} of {products.length} pieces<br />{sourceLabel}</p></div>
        <form className="filters" action="/catalog">
          <input name="q" defaultValue={params.q} placeholder="Search products, styles, brands..." />
          <select name="brand" defaultValue={params.brand ?? ""}><option value="">Brand</option>{brands.map(([slug, name]) => <option value={slug} key={slug}>{name}</option>)}</select>
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
        {filtered.length ? <div className="grid">{filtered.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="empty"><p>No pieces match those filters.</p><a className="link-small" href="/catalog">Reset filters</a></div>}
      </div>
    </main>
  );
}
