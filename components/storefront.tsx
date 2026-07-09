import Link from "next/link";
import Image from "next/image";
import type { StreetProduct } from "@/lib/catalog";
import { SearchToggle } from "@/components/search-overlay";

export function Header() {
  return (
    <header className="header">
      <Link href="/" className="wordmark" aria-label="Street home">STREET</Link>
      <nav className="nav">
        <Link href="/catalog">Shop all</Link>
        <Link href="/catalog?sort=newest">New in</Link>
        <Link href="/brands">Brands</Link>
      </nav>
      <SearchToggle />
    </header>
  );
}

/**
 * `searchQuery` is set when this card is rendered inside search results
 * (app/catalog/page.tsx passes params.q). It's threaded onto the product
 * link so the product page can log a "search_click" analytics event tying
 * the query to the item the shopper actually opened.
 */
export function ProductCard({ product, searchQuery }: { product: StreetProduct; searchQuery?: string }) {
  const secondImage = product.images.length > 1 ? product.images[1] : null;
  const href = searchQuery ? `/products/${product.slug}?sq=${encodeURIComponent(searchQuery)}` : `/products/${product.slug}`;

  return (
    <Link href={href}>
      <div className="card-image">
        {product.primaryImage ? (
          <>
            <Image
              src={product.primaryImage}
              alt={product.title}
              fill
              loading="lazy"
              sizes="(max-width: 840px) 50vw, 25vw"
              className="card-image-primary"
              style={{ objectFit: "contain" }}
            />
            {/* Hover reveals the second catalog photo (often the back of a jacket, etc). Pure CSS — see .card-image:hover in globals.css. */}
            {secondImage ? (
              <Image
                src={secondImage}
                alt=""
                aria-hidden
                fill
                loading="lazy"
                sizes="(max-width: 840px) 50vw, 25vw"
                className="card-image-secondary"
                style={{ objectFit: "contain" }}
              />
            ) : null}
          </>
        ) : (
          <div style={{ height: "100%", width: "100%", background: "linear-gradient(135deg, #d7d4cc, #a7a49e)" }} />
        )}
        {product.stockStatus === "sold_out" ? <span className="badge">Sold out</span> : null}
      </div>
      <p className="brand">{product.brandName}</p>
      <p className="name">{product.title}</p>
      <p className="price">${product.price.toFixed(2)}</p>
    </Link>
  );
}
