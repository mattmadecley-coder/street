import { Header, ProductCard } from "@/components/storefront";
import { getCatalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SeventyFourUniformPage() {
  const { products, source } = await getCatalog();
  const brandProducts = products.filter((product) => product.brandSlug === "seventy-four-uniform");

  return (
    <main>
      <Header />
      <div className="shell">
        <div className="catalog-top">
          <div>
            <p className="eyebrow" style={{ color: "rgba(16,16,16,.55)" }}>Brand catalog</p>
            <h1>Seventy Four Uniform</h1>
          </div>
          <img src="/brand-logos/seventy-four-uniform.svg" alt="Seventy Four Uniform" style={{ width: 170, height: 46, objectFit: "contain" }} />
        </div>
        <p className="results">{brandProducts.length} pieces · {source === "database" ? "saved Street catalog" : "live source import"}</p>
        <div className="grid">{brandProducts.map((product) => <ProductCard key={product.id} product={product} />)}</div>
      </div>
    </main>
  );
}
