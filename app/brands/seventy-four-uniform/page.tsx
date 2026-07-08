import { Header, ProductCard } from "@/components/storefront";
import { getCatalog } from "@/lib/catalog";
import { getCatalogPage } from "@/lib/catalog-page";

export const revalidate = 3600;

export default async function SeventyFourUniformPage() {
  // Ask Supabase for just this brand's products instead of pulling the whole
  // multi-brand catalog and filtering it in memory.
  const brandPage = await getCatalogPage({ brand: "seventy-four-uniform", availability: "all" });
  let brandProducts = brandPage?.products ?? [];
  let source: "database" | "live" | "fallback" = brandPage ? "database" : "fallback";
  if (!brandPage) {
    const catalog = await getCatalog();
    brandProducts = catalog.products.filter((product) => product.brandSlug === "seventy-four-uniform");
    source = catalog.source;
  }

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
