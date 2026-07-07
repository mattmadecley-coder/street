import Link from "next/link";
import type { StreetProduct } from "@/lib/catalog";

export function Header() {
  return (
    <header className="header">
      <Link href="/" className="wordmark" aria-label="Street home">STREET</Link>
      <nav className="nav">
        <Link href="/catalog">Shop all</Link>
        <Link href="/catalog?sort=newest">New in</Link>
        <Link href="/brands">Brands</Link>
      </nav>
      <Link href="/catalog" className="nav" aria-label="Search catalog"><span>Search</span></Link>
    </header>
  );
}

export function ProductCard({ product }: { product: StreetProduct }) {
  return (
    <Link href={`/products/${product.slug}`}>
      <div className="card-image">
        {product.primaryImage ? <img src={product.primaryImage} alt={product.title} loading="lazy" /> : <div style={{ height: "100%", width: "100%", background: "linear-gradient(135deg, #d7d4cc, #a7a49e)" }} />}
        {product.stockStatus === "sold_out" ? <span className="badge">Sold out</span> : null}
        {product.images.length > 1 ? <span className="image-count">{product.images.length} photos</span> : null}
      </div>
      <p className="brand">{product.brandName}</p>
      <p className="name">{product.title}</p>
      <p className="price">${product.price.toFixed(2)}</p>
    </Link>
  );
}
