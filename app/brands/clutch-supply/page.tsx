import { Header, ProductCard } from "@/components/storefront";
import { getCatalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ClutchSupplyPage() {
  const { products, source } = await getCatalog();
  const brandProducts = products.filter((product) => product.brandSlug === "clutch-supply");

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
