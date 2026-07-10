import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { Header, Footer } from "@/components/storefront";
import { ProductGallery } from "@/components/product-gallery";
import { getProduct } from "@/lib/catalog";
import { logSiteEvent } from "@/lib/analytics";

// ISR: rendered HTML for each product slug is cached and revalidated hourly
// at most, with the cron sync invalidating it immediately via revalidateTag.
export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { product } = await getProduct(slug);
  if (!product) return {};
  const title = `${product.title} — ${product.brandName}`;
  const description = product.description || `${product.title} by ${product.brandName}, available now on Street.`;
  return {
    title,
    description,
    openGraph: { title, description, images: product.primaryImage ? [{ url: product.primaryImage }] : undefined },
    twitter: { card: "summary_large_image", title, description, images: product.primaryImage ? [product.primaryImage] : undefined },
  };
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ sq?: string }> }) {
  const { slug } = await params;
  const { sq } = await searchParams;
  const { product, source } = await getProduct(slug);
  if (!product) notFound();

  // Analytics, scheduled after the response is sent so it never adds latency
  // to the product page itself (see lib/analytics.ts). `sq` is set by
  // ProductCard when this page was reached from a search result — it ties
  // the search query to the item the shopper actually opened.
  after(async () => {
    if (sq?.trim()) {
      await logSiteEvent({ eventType: "search_click", query: sq.trim(), productId: product.id, brandSlug: product.brandSlug, path: `/products/${slug}` });
    }
    await logSiteEvent({ eventType: "product_view", productId: product.id, brandSlug: product.brandSlug, streetGroup: product.streetGroup, streetCategory: product.streetCategory, price: product.price, path: `/products/${slug}` });
  });

  const sourceMessage = source === "database" ? "Saved in Street's catalog and refreshed by the scheduled importer." : source === "live" ? "Live source import — this product will be stored after the first database sync." : "The source is unavailable right now. Confirm details on the brand website.";

  return (
    <main>
      <Header />
      <div className="shell product-layout">
        <ProductGallery images={product.images} title={product.title} />
        <aside className="product-info">
          <p className="brand">{product.brandName}</p>
          <h1>{product.title}</h1>
          <p className="price" style={{ fontSize: 18, marginBottom: 14 }}>${product.price.toFixed(2)}</p>
          <span className="status">{product.stockStatus === "in_stock" ? "In stock" : "Sold out"}{product.isPreorder ? " · Pre-order" : ""}</span>
          <Info label="Product images" value={`${product.images.length || 0} official photo${product.images.length === 1 ? "" : "s"} imported`} />
          {product.colors.length ? <Info label="Color" value={product.colors.join(", ")} /> : null}
          <Info label="Available sizes" value={product.sizes.length ? product.sizes.join(" · ") : "Size choices were not supplied by the source catalog."} />
          {product.variants && product.variants.length > 1 ? (
            <div className="info-block">
              <p className="brand" style={{ marginTop: 0 }}>Variations ({product.variants.length})</p>
              <div className="variant-list">
                {product.variants.map((variant) => {
                  const label = variant.title || [variant.option1, variant.option2, variant.option3].filter(Boolean).join(" / ") || "Variant";
                  return (
                    <span key={variant.externalId} className={`variant-chip${variant.available ? "" : " variant-chip-sold-out"}`}>
                      {label}{variant.available ? "" : " · Sold out"}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : null}
          <Info label="Description" value={product.description || "See the brand website for complete product details and shipping information."} />
          <a
            className="cta"
            href={`/api/out?to=${encodeURIComponent(product.sourceUrl)}&brand=${encodeURIComponent(product.brandSlug)}&product=${encodeURIComponent(product.slug)}`}
            target="_blank"
            rel="noreferrer"
          >
            <span>Shop at {product.brandName}</span><span>↗</span>
          </a>
          <p className="results" style={{ lineHeight: 1.45 }}>{sourceMessage}</p>
          <div className="tags">{product.tags.slice(0, 12).map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>
        </aside>
      </div>
      <Footer />
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="info-block"><p className="brand" style={{ marginTop: 0 }}>{label}</p><p>{value}</p></div>;
}
