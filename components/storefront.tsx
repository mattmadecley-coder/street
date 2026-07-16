import Link from "next/link";
import type { StreetProduct } from "@/lib/catalog";
import { SearchToggle } from "@/components/search-overlay";
import { CategoryMenu } from "@/components/category-menu";
import { MobileMoreMenu } from "@/components/mobile-more-menu";
import { ProductCardMedia } from "@/components/product-card-media";
import { CartNavLink } from "@/components/cart-nav-link";
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
        <CartNavLink />
        <MobileMoreMenu />
      </nav>
      <SearchToggle />
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer footer-expanded">
      <div className="footer-columns">
        <div><Link href="/" className="footer-wordmark">STREET</Link><p className="footer-note">Discover independent labels in one place. Purchases currently finish on each brand’s own website.</p></div>
        <div><p className="footer-heading">Shop</p><Link href="/catalog">Shop all</Link><Link href="/catalog?sort=newest">New in</Link><Link href="/brands">Brands</Link><Link href="/cart">Cart</Link></div>
        <div><p className="footer-heading">Street</p><Link href="/brands/apply">Want your brand featured?</Link><Link href="/privacy">Privacy &amp; terms</Link><a href="mailto:hello@street.com">Contact</a></div>
        <div><p className="footer-heading">For brands</p><p className="footer-note">Think your label is moving the culture forward? Apply for catalog consideration and future direct-checkout opportunities.</p><Link href="/brands/apply" className="footer-apply">Apply to Street →</Link></div>
      </div>
      <div className="footer-bottom">© {new Date().getFullYear()} Street. Street is independent and is not affiliated with the brands listed.</div>
    </footer>
  );
}

export async function ProductCard({ product, searchQuery, priority = false }: { product: StreetProduct; searchQuery?: string; priority?: boolean }) {
  const secondImage = product.images.length > 1 ? product.images[1] : null;
  const href = searchQuery ? `/products/${product.slug}?sq=${encodeURIComponent(searchQuery)}` : `/products/${product.slug}`;
  const recentlyAdded = product.createdAt ? isRecentlyAdded(product.createdAt) : await isProductRecentlyAdded(product.id);
  return (
    <Link href={href}>
      <div className="card-image">
        <ProductCardMedia primaryImage={product.primaryImage} secondImage={secondImage} title={product.title} priority={priority} />
        {recentlyAdded ? <span className="badge" style={{ background: "#f4f3ee", color: "#101010", border: "1px solid #101010" }}>Just added</span> : null}
        {product.stockStatus === "sold_out" ? <span className="badge" style={{ top: recentlyAdded ? 42 : 8 }}>Sold out</span> : null}
        {product.variantCount > 1 ? <span className="badge badge-variants">{product.variantCount} options</span> : null}
      </div>
      <p className="brand">{product.brandName}</p><p className="name">{product.title}</p><p className="price">${product.price.toFixed(2)}</p>
    </Link>
  );
}
