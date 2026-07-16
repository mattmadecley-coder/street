import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { Header, Footer, isRecentlyAdded } from "@/components/storefront";
import { ProductGallery } from "@/components/product-gallery";
import { ProductVariantProvider } from "@/components/product-variant-context";
import { VariantPicker } from "@/components/variant-picker";
import { ProductPurchaseActions } from "@/components/product-purchase-actions";
import { getProduct } from "@/lib/catalog";
import { logSiteEvent } from "@/lib/analytics";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { product } = await getProduct(slug);
  if (!product) return {};
  const title = `${product.title} — ${product.brandName}`;
  const description = product.description || `${product.title} by ${product.brandName}, available now on Street.`;
  return { title, description, openGraph: { title, description, images: product.primaryImage ? [{ url: product.primaryImage }] : undefined }, twitter: { card: "summary_large_image", title, description, images: product.primaryImage ? [product.primaryImage] : undefined } };
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ sq?: string }> }) {
  const { slug } = await params;
  const { sq } = await searchParams;
  const { product, source } = await getProduct(slug);
  if (!product) notFound();

  after(async () => {
    if (sq?.trim()) await logSiteEvent({ eventType: "search_click", query: sq.trim(), productId: product.id, brandSlug: product.brandSlug, path: `/products/${slug}` });
    await logSiteEvent({ eventType: "product_view", productId: product.id, brandSlug: product.brandSlug, streetGroup: product.streetGroup, streetCategory: product.streetCategory, price: product.price, path: `/products/${slug}` });
  });

  const sourceMessage = source === "database" ? "Saved in Street's catalog and refreshed by the scheduled importer." : source === "live" ? "Live source import — this product will be stored after the first database sync." : "The source is unavailable right now. Confirm details on the brand website.";
  const recentlyAdded = isRecentlyAdded(product.createdAt);

  return (
    <main>
      <Header />
      <div hidden data-mascot-product data-title={product.title} data-brand={product.brandName} data-price={product.price} data-stock={product.stockStatus} data-category={product.streetCategory ?? product.category} data-colors={product.colors.join("|")} />
      <ProductVariantProvider>
        <div className="shell product-layout">
          <ProductGallery images={product.images} title={product.title} />
          <aside className="product-info">
            <p className="brand">{product.brandName}</p>
            <h1>{product.title}</h1>
            <p className="price" style={{ fontSize: 18, marginBottom: 14 }}>${product.price.toFixed(2)}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="status">{product.stockStatus === "in_stock" ? "In stock" : "Sold out"}{product.isPreorder ? " · Pre-order" : ""}</span>
              {recentlyAdded ? <span className="status" style={{ background: "#101010", color: "#fff" }}>Just added</span> : null}
            </div>
            <Info label="Product images" value={`${product.images.length || 0} official photo${product.images.length === 1 ? "" : "s"} imported`} />
            {product.colors.length ? <Info label="Color" value={product.colors.join(", ")} /> : null}
            <Info label="Available sizes" value={product.sizes.length ? product.sizes.join(" · ") : "Size choices were not supplied by the source catalog."} />
            <VariantPicker variants={product.variants ?? []} />
            <Info label="Description" value={product.description || "See the brand website for complete product details and shipping information."} />
            <ProductPurchaseActions product={{ id: product.id, slug: product.slug, title: product.title, brandName: product.brandName, brandSlug: product.brandSlug, price: product.price, primaryImage: product.primaryImage, sourceUrl: product.sourceUrl, stockStatus: product.stockStatus, variantCount: product.variantCount }} />
            <p className="results" style={{ lineHeight: 1.45 }}>{sourceMessage}</p>
            <div className="tags">{product.tags.slice(0, 12).map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>
          </aside>
        </div>
      </ProductVariantProvider>
      <Footer />
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="info-block"><p className="brand" style={{ marginTop: 0 }}>{label}</p><p>{value}</p></div>;
}
