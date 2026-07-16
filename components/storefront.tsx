import Link from "next/link";
import type { StreetProduct } from "@/lib/catalog";
import { SearchToggle } from "@/components/search-overlay";
import { CategoryMenu } from "@/components/category-menu";
import { MobileMoreMenu } from "@/components/mobile-more-menu";
import { ProductCardMedia } from "@/components/product-card-media";
import { getActiveCategorySummary } from "@/lib/catalog-store";
import { isProductRecentlyAdded } from "@/lib/recent-products";

const RECENT_PRODUCT_MS = 24 * 60 * 60_000;

export function isRecentlyAdded(createdAt?: string): boolean {
  if (!createdAt) return false;
  const timestamp = new Date(createdAt).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp >= 0 && Date.now() - timestamp <= RECENT_PRODUCT_MS;
}

export async function Header() {
  const categorySummary = await getActiveCategorySummary();
  return (
    <header className="header">
      <Link href="/" className="wordmark" aria-label="Street home">STREET</Link>
      <nav className="nav">
        <Link href="/catalog">Shop all</Link>
        <CategoryMenu summary={categorySummary} />
        <Link href="/catalog?sort=newest" className="nav-hide-mobile">New in</Link>
        <Link href="/brands" className="nav-hide-mobile">Brands</Link>
        <MobileMoreMenu />
      </nav>
      <SearchToggle />
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <p className="footer-note">Street is an independent discovery site — every purchase happens on the brand&rsquo;s own website. Street isn&rsquo;t affiliated with, and doesn&rsquo;t sell for, the brands listed here.</p>
        <nav className="footer-links">
          <Link href="/catalog">Shop all</Link>
          <Link href="/brands">Brands</Link>
          <Link href="/privacy">Privacy &amp; terms</Link>
        </nav>
      </div>
    </footer>
  );
}

/**
 * `searchQuery` is set when this card is rendered inside search results
 * (app/catalog/page.tsx passes params.q). It's threaded onto the product
 * link so the product page can log a "search_click" analytics event tying
 * the query to the item the shopper actually opened.
 */
export async function ProductCard({ product, searchQuery, priority = false }: { product: StreetProduct; searchQuery?: string; priority?: boolean }) {
  const secondImage = product.images.length > 1 ? product.images[1] : null;
  const href = searchQuery ? `/products/${product.slug}?sq=${encodeURIComponent(searchQuery)}` : `/products/${product.slug}`;
  const recentlyAdded = product.createdAt ? isRecentlyAdded(product.createdAt) : await isProductRecentlyAdded(product.id);

  return (
    <Link href={href}>
      <div className="card-image">
        <ProductCardMedia
          primaryImage={product.primaryImage}
          secondImage={secondImage}
          title={product.title}
          priority={priority}
        />
        {recentlyAdded ? (
          <span className="badge" style={{ background: "#f4f3ee", color: "#101010", border: "1px solid #101010" }}>Just added</span>
        ) : null}
        {product.stockStatus === "sold_out" ? <span className="badge" style={{ top: recentlyAdded ? 42 : 8 }}>Sold out</span> : null}
        {product.variantCount > 1 ? <span className="badge badge-variants">{product.variantCount} options</span> : null}
      </div>
      <p className="brand">{product.brandName}</p>
      <p className="name">{product.title}</p>
      <p className="price">${product.price.toFixed(2)}</p>
    </Link>
  );
}
