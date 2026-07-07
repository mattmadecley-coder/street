import { notFound } from "next/navigation";
import { Header } from "@/components/storefront";
import { getProduct } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { product, source } = await getProduct(slug);
  if (!product) notFound();
  const galleryImages = product.images.length ? product.images : [""];
  const sourceMessage = source === "database" ? "Saved in Street's catalog and refreshed by the scheduled importer." : source === "live" ? "Live source import — this product will be stored after the first database sync." : "The source is unavailable right now. Confirm details on the brand website.";

  return (
    <main>
      <Header />
      <div className="shell product-layout">
        <section className="gallery" aria-label={`${product.title} image gallery`}>
          {galleryImages.map((image, index) => (
            <div key={`${image}-${index}`}>
              {image ? <img src={image} alt={`${product.title} — image ${index + 1} of ${galleryImages.length}`} /> : <div style={{ height: "100%", width: "100%", background: "linear-gradient(135deg,#d7d4cc,#a7a49e)" }} />}
            </div>
          ))}
        </section>
        <aside className="product-info">
          <p className="brand">{product.brandName}</p>
          <h1>{product.title}</h1>
          <p className="price" style={{ fontSize: 18, marginBottom: 14 }}>${product.price.toFixed(2)}</p>
          <span className="status">{product.stockStatus === "in_stock" ? "In stock" : "Sold out"}{product.isPreorder ? " · Pre-order" : ""}</span>
          <Info label="Product images" value={`${product.images.length || 0} official photo${product.images.length === 1 ? "" : "s"} imported`} />
          {product.colors.length ? <Info label="Color" value={product.colors.join(", ")} /> : null}
          <Info label="Available sizes" value={product.sizes.length ? product.sizes.join(" · ") : "Size choices were not supplied by the source catalog."} />
          <Info label="Description" value={product.description || "See the brand website for complete product details and shipping information."} />
          <a className="cta" href={product.sourceUrl} target="_blank" rel="noreferrer"><span>Shop at {product.brandName}</span><span>↗</span></a>
          <p className="results" style={{ lineHeight: 1.45 }}>{sourceMessage}</p>
          <div className="tags">{product.tags.slice(0, 12).map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>
        </aside>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="info-block"><p className="brand" style={{ marginTop: 0 }}>{label}</p><p>{value}</p></div>;
}
