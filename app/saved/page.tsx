"use client";

import Link from "next/link";
import { Header, Footer } from "@/components/storefront";
import { CatalogImage } from "@/components/catalog-image";
import { useSaved } from "@/components/saved-context";

function SavedImageFallback() {
  return <span aria-hidden="true" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "rgba(16,16,16,.42)", fontSize: 9, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" }}>Image unavailable</span>;
}

export default function SavedPage() {
  const { items, remove, clear } = useSaved();

  return (
    <>
      <Header />
      <main className="shell">
        <div className="catalog-top">
          <h1>Saved</h1>
          {items.length ? <button type="button" className="text-button" onClick={clear}>Clear all</button> : null}
        </div>
        {!items.length ? (
          <div className="empty"><h2>Nothing saved yet.</h2><p>Tap &ldquo;Save item&rdquo; on any product page to keep track of it here. Saved items live in this browser, so they&rsquo;ll be here next time you visit -- no account needed.</p><Link href="/catalog" className="cta cart-empty-cta"><span>Shop all</span><span>→</span></Link></div>
        ) : (
          <div className="grid">
            {items.map((item) => (
              <article className="product-card" key={item.slug}>
                <Link href={`/products/${item.slug}`} className="card-image">
                  {item.image ? (
                    <CatalogImage src={item.image} widthHint={720} fallback={<SavedImageFallback />} alt={item.title} fill sizes="(max-width: 840px) 50vw, (max-width: 1280px) 33vw, 25vw" style={{ objectFit: "contain" }} />
                  ) : <SavedImageFallback />}
                </Link>
                <p className="brand"><Link href={`/brands/${item.brandSlug}`}>{item.brandName}</Link></p>
                <p className="name"><Link href={`/products/${item.slug}`}>{item.title}</Link></p>
                <div className="price-row"><p className="price">${item.price.toFixed(2)}</p></div>
                <button type="button" className="text-button" style={{ marginTop: 8 }} onClick={() => remove(item.slug)}>Remove</button>
              </article>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
