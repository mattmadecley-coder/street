import { notFound } from "next/navigation";
import { Header } from "@/components/storefront";
import { getProduct } from "@/lib/catalog";

export const revalidate = 86400;

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { product, source } = await getProduct(slug);
  if (!product) notFound();
  return (
    <main>
      <Header />
      <div className="shell product-layout">
        <section className="gallery">
          {(product.images.length ? product.images : [""]).map((image, index) => <div key={`${image}-${index}`}>{image ? <img src={image} alt={`${product.title} ${index + 1}`} /> : <div style={{ height: "100%", background: "linear-gradient(135deg,#d7d4cc,#a7a49e)" }} />}</div>)}
        </section>
        <aside className="product-info">
          <p className="brand">Seventy Four Uniform</p>
          <h1>{product.title}</h1>
          <p className="price" style={{ fontSize: 18, marginBottom: 14 }}>${product.price.toFixed(2)}</p>
          <span className="status">{product.stockStatus === "in_stock" ? "In stock" : "Sold out"}{product.isPreorder ? " · Pre-order" : ""}</span>
          {product.colors.length ? <Info label="Color" value={product.colors.join(", ")} /> : null}
          <Info label="Available sizes" value={product.sizes.length ? product.sizes.join(" · ") : "No verified size chart imported yet."} />
          <Info label="Description" value={product.description || "See the brand website for complete product details and shipping information."} />
          <a className="cta" href={product.sourceUrl} target="_blank" rel="noreferrer"><span>Shop at Seventy Four Uniform</span><span>↗</span></a>
          <p className="results" style={{ lineHeight: 1.45 }}>{source === "live" ? "Inventory information is refreshed daily from the brand’s public catalog." : "Catalog information is temporarily cached. Confirm final availability on the brand website."}</p>
          <div className="tags">{product.tags.slice(0, 12).map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>
        </aside>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="info-block"><p className="brand" style={{ marginTop: 0 }}>{label}</p><p>{value}</p></div>;
}
