import { Header, ProductCard } from "@/components/storefront";
import { getCatalog } from "@/lib/catalog";
import { getAllCatalogProducts } from "@/lib/catalog-page";

export const revalidate = 3600;

export default async function ClutchSupplyPage() {
  // Ask Supabase for all of just this brand's products (paged through
  // internally) instead of pulling the whole multi-brand catalog and
  // filtering it in memory.
  const brandCatalog = await getAllCatalogProducts({ brand: "clutch-supply", availability: "all" });
  let brandProducts = brandCatalog?.products ?? [];
  let source: "database" | "live" | "fallback" = brandCatalog ? "database" : "fallback";
  if (!brandCatalog) {
    const catalog = await getCatalog();
    brandProducts = catalog.products.filter((product) => product.brandSlug === "clutch-supply");
    source = catalog.source;
  }

  return (
    <main>
      <Header />
      <div className="shell">
        <div className="catalog-top">
          <div>
            <p className="eyebrow" style={{ color: "rgba(16,16,16,.55)" }}>Brand catalog</p>
            <h1>Clutch Supply</h1>
          </div>
          <p className="brand" style={{ fontSize: 13, color: "#101010" }}>CLUTCH SUPPLY</p>
        </div>
        <p className="results">{brandProducts.length} pieces · {source === "database" ? "saved Street catalog" : "live source import"}</p>
        <div className="grid">{brandProducts.map((product) => <ProductCard key={product.id} product={product} />)}</div>
      </div>
    </main>
  );
}
