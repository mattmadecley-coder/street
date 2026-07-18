import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Footer, ProductCard, isRecentlyAdded } from "@/components/storefront";
import { ProductGallery } from "@/components/product-gallery";
import { ProductVariantProvider } from "@/components/product-variant-context";
import { ProductDetailPanel } from "@/components/product-detail-panel";
import { getCatalog, getProduct } from "@/lib/catalog";
import "./product-page.css";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { product } = await getProduct(slug);
  if (!product) return {};
  const title = `${product.title} — ${product.brandName}`;
  const description = product.description || `${product.title} by ${product.brandName}, available now on Street.`;
  return { title, description, alternates: { canonical: `/products/${product.slug}` }, openGraph: { title, description, type: "website", images: product.primaryImage ? [{ url: product.primaryImage }] : undefined }, twitter: { card: "summary_large_image", title, description, images: product.primaryImage ? [product.primaryImage] : undefined } };
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ sq?: string }> }) {
  const { slug } = await params;
  const { sq } = await searchParams;
  const [{ product, source }, catalog] = await Promise.all([getProduct(slug), getCatalog()]);
  if (!product) notFound();

  const sourceMessage = source === "database" ? "Catalog details are refreshed directly from the brand." : source === "live" ? "Live details from the brand catalog." : "Confirm final details on the brand website.";
  const recentlyAdded = isRecentlyAdded(product.createdAt);
  const related = catalog.products.filter((item) => item.slug !== product.slug && (item.brandSlug === product.brandSlug || item.streetCategory === product.streetCategory || item.category === product.category)).sort((a, b) => Number(b.brandSlug === product.brandSlug) - Number(a.brandSlug === product.brandSlug)).slice(0, 8);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description || undefined,
    image: product.images,
    sku: product.id,
    brand: { "@type": "Brand", name: product.brandName },
    category: product.streetCategory ?? product.category,
    offers: {
      "@type": "Offer",
      url: product.sourceUrl,
      priceCurrency: "USD",
      price: product.price,
      availability: product.stockStatus === "in_stock" ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: product.brandName },
    },
  };

  return <main className="product-page">
    <Header />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    <div hidden data-mascot-product data-analytics-product-view data-product-id={product.id} data-product-slug={product.slug} data-brand-slug={product.brandSlug} data-search-query={sq?.trim() || undefined} data-street-group={product.streetGroup ?? undefined} data-street-category={product.streetCategory ?? undefined} data-title={product.title} data-brand={product.brandName} data-price={product.price} data-stock={product.stockStatus} data-category={product.streetCategory ?? product.category} data-colors={product.colors.join("|")} />
    <ProductVariantProvider>
      <div className="shell product-shell">
        <nav className="product-breadcrumbs" aria-label="Breadcrumb"><Link href="/catalog">Shop</Link><span>/</span>{product.streetCategory || product.category ? <><Link href={`/catalog?category=${encodeURIComponent(product.streetCategory ?? product.category)}`}>{product.streetCategory ?? product.category}</Link><span>/</span></> : null}<span>{product.title}</span></nav>
        {sq ? <p className="product-back-link"><Link href={`/catalog?q=${encodeURIComponent(sq)}`}>← Back to results for “{sq}”</Link></p> : null}
        <div className="product-layout">
          <ProductGallery images={product.images} title={product.title} />
          <ProductDetailPanel product={{ ...product, variants: product.variants ?? [] }} recentlyAdded={recentlyAdded} sourceMessage={sourceMessage} />
        </div>
      </div>
    </ProductVariantProvider>
    {related.length ? <section className="shell product-recommendations" aria-labelledby="related-products"><div className="section-head"><div><p className="eyebrow">Keep discovering</p><h2 id="related-products" className="section-title">{related.some((item) => item.brandSlug === product.brandSlug) ? `More from ${product.brandName}` : "You may also like"}</h2></div><Link className="link-small" href={`/brands/${product.brandSlug}`}>View brand</Link></div><div className="grid">{related.map((item, index) => <ProductCard key={item.id} product={item} position={index + 1} sourceComponent="product_recommendations" />)}</div></section> : null}
    <Footer />
  </main>;
}
