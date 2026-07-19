import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Footer, ProductCard } from "@/components/storefront";
import { CatalogImage } from "@/components/catalog-image";
import { CATALOG_PAGE_SIZE, getCatalogPage } from "@/lib/catalog-page";
import { getBrandDirectory } from "@/lib/catalog-store";
import styles from "./brand.module.css";

type Params = { availability?: string; sort?: string; page?: string };

function pageHref(slug: string, params: Params, page: number) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (key !== "page" && value) search.set(key, value);
  if (page > 1) search.set("page", String(page));
  const query = search.toString();
  return `/brands/${slug}${query ? `?${query}` : ""}`;
}

function instagramLabel(url: string | null) {
  if (!url) return null;
  try {
    const handle = new URL(url).pathname.split("/").filter(Boolean)[0];
    return handle ? `@${handle}` : "Instagram";
  } catch {
    return "Instagram";
  }
}

export const revalidate = 3600;

export default async function BrandPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Params> }) {
  const { slug } = await params;
  const filters = await searchParams;
  const brand = (await getBrandDirectory()).find((entry) => entry.slug === slug);
  if (!brand) notFound();

  const requestedPage = Math.max(1, Math.floor(Number(filters.page) || 1));
  const catalog = await getCatalogPage({ brand: slug, page: requestedPage, availability: filters.availability, sort: filters.sort });
  const products = catalog?.products ?? [];
  const total = catalog?.total ?? 0;
  const currentPage = catalog?.page ?? requestedPage;
  const totalPages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));

  return (
    <main>
      <Header />
      <div className="shell">
        <section className={styles.hero}>
          <div className={styles.identity}>
            <div className={styles.logo}>{brand.logoUrl ? <CatalogImage src={brand.logoUrl} widthHint={720} fallback={<strong>{brand.name}</strong>} alt={brand.name} width={420} height={140} sizes="(max-width: 840px) 70vw, 360px" /> : <strong>{brand.name}</strong>}</div>
            <div><p className="eyebrow">Independent brand on Street</p><h1>{brand.name}</h1><p>{total.toLocaleString()} piece{total === 1 ? "" : "s"} available to discover.</p></div>
          </div>
          <div className={styles.links}>
            <a href={`/api/out?to=${encodeURIComponent(brand.storeUrl)}&brand=${encodeURIComponent(brand.slug)}`} target="_blank" rel="noreferrer">Visit website ↗</a>
            {brand.instagramUrl ? <a href={brand.instagramUrl} target="_blank" rel="noreferrer">{instagramLabel(brand.instagramUrl)} ↗</a> : null}
          </div>
        </section>

        <section className={styles.catalog}>
          <div className={styles.catalogHead}><div><p className="eyebrow">Shop the brand</p><h2>All products</h2></div><p className="results">{total.toLocaleString()} pieces</p></div>
          <form className="filters" action={`/brands/${slug}`}>
            <select name="availability" defaultValue={filters.availability ?? "in_stock"}><option value="in_stock">In stock</option><option value="all">Include sold out</option></select>
            <select name="sort" defaultValue={filters.sort ?? ""}>
              <option value="">Relevance</option>
              <option value="best-sellers">Best sellers</option>
              <option value="newest">Newest</option>
              <option value="price-low">Price: low to high</option>
              <option value="price-high">Price: high to low</option>
            </select>
            <button type="submit">Apply</button>
          </form>
          {products.length ? <div className="grid">{products.map((product, index) => <ProductCard key={product.id} product={product} position={(currentPage - 1) * CATALOG_PAGE_SIZE + index + 1} sourceComponent="brand_page" />)}</div> : <div className="empty"><p>No products match those filters.</p><Link className="link-small" href={`/brands/${slug}`}>Reset filters</Link></div>}
          {totalPages > 1 ? <nav className={styles.pagination} aria-label="Brand product pages">
            {currentPage > 1 ? <Link className="link-small" href={pageHref(slug, filters, currentPage - 1)}>← Previous</Link> : <span />}
            <span>Page {currentPage} of {totalPages}</span>
            {currentPage < totalPages ? <Link className="link-small" href={pageHref(slug, filters, currentPage + 1)}>Next →</Link> : <span />}
          </nav> : null}
        </section>
      </div>
      <Footer />
    </main>
  );
}
