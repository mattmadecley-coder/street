import Link from "next/link";
import type { StreetProduct } from "@/lib/catalog";
import { SearchToggle } from "@/components/search-overlay";
import { CategoryMenu } from "@/components/category-menu";
import { ProductCardMedia } from "@/components/product-card-media";
import { CartNavLink } from "@/components/cart-nav-link";
import { MobileNavigation } from "@/components/mobile-navigation";
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
      <nav className="nav desktop-nav">
        <Link href="/catalog">Shop all</Link>
        <CategoryMenu summary={categorySummary} />
        <Link href="/catalog?sort=newest">New in</Link>
        <Link href="/brands">Brands</Link>
        <CartNavLink />
      </nav>
      <div className="header-actions">
        <div className="mobile-cart-link"><CartNavLink /></div>
        <SearchToggle />
        <MobileNavigation categorySummary={categorySummary} />
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer footer-expanded">
      <div className="footer-columns">
        <div><Link href="/" className="footer-wordmark">STREET</Link><p className="footer-note">Discover independent labels in one place. Purchases currently finish on each brand’s own website.</p></div>
        <div><p className="footer-heading">Shop</p><Link href="/catalog">Shop all</Link><Link href="/catalog?sort=newest">New in</Link><Link href="/brands">Brands</Link><Link href="/cart">Cart</Link></div>
        <div><p className="footer-heading">Street</p><Link href="/brands/apply">Get your brand discovered</Link><Link href="/privacy">Privacy &amp; terms</Link><a href="mailto:hello@street.com">Contact</a></div>
        <div><p className="footer-heading">For brands</p><p className="footer-note">Put your products in front of shoppers actively looking for independent streetwear—and turn discovery into sales.</p><Link href="/brands/apply" className="footer-apply">Grow with Street →</Link></div>
      </div>
      <div className="footer-bottom">© {new Date().getFullYear()} Street. Street is independent and is not affiliated with the brands listed.</div>
    </footer>
  );
}

export async function ProductCard({ product, searchQuery, priority = false, position, sourceComponent }: { product: StreetProduct; searchQuery?: string; priority?: boolean; position?: number; sourceComponent?: string }) {
  const secondImage = product.images.length > 1 ? product.images[1] : null;
  const href = searchQuery ? `/products/${product.slug}?sq=${encodeURIComponent(searchQuery)}` : `/products/${product.slug}`;
  const recentlyAdded = product.createdAt ? isRecentlyAdded(product.createdAt) : await isProductRecentlyAdded(product.id);
  const component = sourceComponent ?? (searchQuery ? "search_results" : "product_grid");
  const analyticsMetadata = JSON.stringify({ productSlug: product.slug, productTitle: product.title });
  return (
    <Link
      href={href}
      className="product-card"
      data-analytics-event="product_click"
      data-analytics-component={component}
      data-analytics-position={position}
      data-analytics-product={product.id}
      data-analytics-brand={product.brandSlug}
      data-analytics-query={searchQuery}
      data-analytics-metadata={analyticsMetadata}
      data-product-impression
      data-product-id={product.id}
      data-product-slug={product.slug}
      data-product-title={product.title}
      data-brand-slug={product.brandSlug}
      data-source-component={component}
      data-position={position}
    >
      <div className="card-image">
        <ProductCardMedia primaryImage={product.primaryImage} secondImage={secondImage} title={product.title} priority={priority} />
        {recentlyAdded ? <span className="badge badge-recent">Just added</span> : null}
        {product.stockStatus === "sold_out" ? <span className="badge badge-stock" style={{ top: recentlyAdded ? 42 : 8 }}>Sold out</span> : null}
        {product.variantCount > 1 ? <span className="badge badge-variants">{product.variantCount} options</span> : null}
      </div>
      <p className="brand">{product.brandName}</p><p className="name">{product.title}</p><p className="price">${product.price.toFixed(2)}</p>
    </Link>
  );
}
