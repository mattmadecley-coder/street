import Link from "next/link";
import Image from "next/image";
import type { StreetProduct } from "@/lib/catalog";
import { STREET_BRANDS } from "@/lib/brands";
import { STREET_COLLECTIONS, STREET_MENU_TAGS, STREET_TAXONOMY } from "@/lib/street-taxonomy";

function catalogLink(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `/catalog?${search.toString()}`;
}

const featuredBrands = [
  ...STREET_BRANDS.filter((brand) => brand.featured),
  ...STREET_BRANDS.filter((brand) => !brand.featured),
].slice(0, 9);

export function Header({ productCount }: { productCount?: number }) {
  const shopLabel = typeof productCount === "number" ? `Shop ${productCount.toLocaleString()} Pieces` : "Shop";

  return (
    <header className="header">
      <Link href="/" className="wordmark" aria-label="Street home">STREET</Link>
      <nav className="nav" aria-label="Primary navigation">
        <div className="nav-item mega-trigger">
          <Link href="/catalog">{shopLabel}</Link>
          <div className="mega-menu" aria-label="Shop menu">
            <div className="mega-column mega-categories">
              <p>Categories</p>
              {Object.entries(STREET_TAXONOMY).map(([group, categories]) => (
                <div className="mega-group" key={group}>
                  <Link href={catalogLink({ group })} className="mega-group-title">{group}</Link>
                  <div>
                    {categories.map((category) => <Link href={catalogLink({ category })} key={category}>{category}</Link>)}
                  </div>
                </div>
              ))}
            </div>
            <div className="mega-column">
              <p>Collections</p>
              {STREET_COLLECTIONS.map((collection) => <Link href={collection.href} key={collection.label}>{collection.label}</Link>)}
            </div>
            <div className="mega-column">
              <p>Styles</p>
              {STREET_MENU_TAGS.map((tag) => <Link href={catalogLink({ tag })} key={tag}>{tag.replaceAll("-", " ")}</Link>)}
            </div>
            <div className="mega-column">
              <p>Featured brands</p>
              {featuredBrands.map((brand) => <Link href={catalogLink({ brand: brand.slug })} key={brand.slug}>{brand.name}</Link>)}
            </div>
          </div>
        </div>
        <Link href="/catalog?sort=newest">New in</Link>
        <Link href="/brands">Brands</Link>
      </nav>
      <Link href="/catalog" className="nav-search" aria-label="Search catalog"><span>Search</span></Link>
    </header>
  );
}

export function ProductCard({ product }: { product: StreetProduct }) {
  return (
    <Link href={`/products/${product.slug}`}>
      <div className="card-image">
        {product.primaryImage ? (
          <Image
            src={product.primaryImage}
            alt={product.title}
            fill
            loading="lazy"
            sizes="(max-width: 840px) 50vw, 25vw"
            style={{ objectFit: "contain" }}
          />
        ) : (
          <div style={{ height: "100%", width: "100%", background: "linear-gradient(135deg, #d7d4cc, #a7a49e)" }} />
        )}
        {product.stockStatus === "sold_out" ? <span className="badge">Sold out</span> : null}
        {product.images.length > 1 ? <span className="image-count">{product.images.length} photos</span> : null}
      </div>
      <p className="brand">{product.brandName}</p>
      <p className="name">{product.title}</p>
      <p className="price">${product.price.toFixed(2)}</p>
    </Link>
  );
}
