import Link from "next/link";
import { headers } from "next/headers";
import { after } from "next/server";
import styles from "./home.module.css";
import { Header, Footer, ProductCard } from "@/components/storefront";
import { getCatalogPage } from "@/lib/catalog-page";
import { getSiteSettings } from "@/lib/site-settings";
import { getBrandDirectory, getHomepageCategoryShowcase } from "@/lib/catalog-store";
import { logSiteEvent } from "@/lib/analytics";

// This route is dynamic (it reads request headers for traffic-source
// logging) but the underlying Supabase reads are still cached — see
// lib/supabase-rest.ts — so it stays cheap.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [settings, brands, requestHeaders, categoryShowcase, newInPage, under50Page] = await Promise.all([
    getSiteSettings(),
    getBrandDirectory(),
    headers(),
    getHomepageCategoryShowcase(8),
    getCatalogPage({ sort: "newest", availability: "in_stock" }),
    getCatalogPage({ max: 50, sort: "newest", availability: "in_stock" }),
  ]);
  const newIn = newInPage?.products.slice(0, 10) ?? [];
  const under50 = under50Page?.products.slice(0, 10) ?? [];

  // Only ever pick a brand that actually has products to show — otherwise
  // the hero spotlight and "Featured brand" section could link to an empty
  // filtered catalog (e.g. a brand still importing, or one whose source
  // Street can't scrape yet).
  const brandsWithStock = brands.filter((brand) => brand.productCount > 0);
  const featuredBrand = brandsWithStock.find((brand) => brand.slug === settings.featured_brand_slug) ?? brandsWithStock.find((brand) => brand.featured) ?? brandsWithStock[0];
  const featuredPage = featuredBrand ? await getCatalogPage({ brand: featuredBrand.slug, availability: "in_stock" }) : null;
  const featured = featuredPage?.products.slice(0, 8) ?? [];

  // Homepage traffic sources (README's "where is our traffic coming from"):
  // logged after the response is sent so it never adds latency.
  after(async () => {
    await logSiteEvent({ eventType: "page_view", path: "/", referrer: requestHeaders.get("referer") });
  });

  const heroVideoUrl = settings.hero_video_url || undefined;
  const heroImageUrl = settings.hero_image_url || "/hero-placeholder.svg";
  const spotlightBrands = brands.filter((brand) => brand.featured && brand.productCount > 0).slice(0, 8);
  const brandGrid = (spotlightBrands.length ? spotlightBrands : brands.filter((brand) => brand.productCount > 0)).slice(0, 8);

  return (
    <main>
      <Header />
      <div className="shell">
        <section className={`hero ${styles.heroVideo}`}>
          {heroVideoUrl ? (
            <video className={styles.heroMedia} autoPlay muted loop playsInline preload="metadata" poster="/hero-placeholder.svg">
              <source src={heroVideoUrl} type="video/mp4" />
            </video>
          ) : (
            <img className={styles.heroMedia} src={heroImageUrl} alt="Street hero" />
          )}
          {featuredBrand ? (
            <Link href={`/catalog?brand=${featuredBrand.slug}`} className={styles.brandSpotlight} aria-label={`Check out ${featuredBrand.name} collections`}>
              <span className={styles.brandSpotlightLabel}>{settings.featured_brand_cta_label || "Check out their collections"}</span>
              {featuredBrand.logoUrl ? <img src={featuredBrand.logoUrl} alt={featuredBrand.name} className={styles.brandSpotlightLogo} /> : <strong>{featuredBrand.name}</strong>}
            </Link>
          ) : null}
        </section>
        <Link href="/catalog" className="shop-all"><span>Shop all</span><span>→</span></Link>

        {categoryShowcase.length ? (
          <section className="section">
            <div className="section-head">
              <div><p className="eyebrow" style={{ color: "rgba(16,16,16,.55)" }}>Browse</p><h2 className="section-title">Shop by category</h2></div>
            </div>
            <div className={styles.categoryGrid}>
              {categoryShowcase.map((item) => (
                <Link key={`${item.group}-${item.category}`} href={`/catalog?group=${encodeURIComponent(item.group)}&category=${encodeURIComponent(item.category)}`} className={styles.categoryTile}>
                  {item.imageUrl ? <img src={item.imageUrl} alt={item.category} /> : <div className={styles.categoryTileFallback} />}
                  <span className={styles.categoryTileLabel}>
                    <strong>{item.category}</strong>
                    <em>{item.count} piece{item.count === 1 ? "" : "s"}</em>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {featuredBrand ? (
          <section className="section">
            <div className="section-head">
              <div><p className="eyebrow" style={{ color: "rgba(16,16,16,.55)" }}>Featured brand</p><h2 className="section-title">{featuredBrand.name}</h2></div>
              <Link href={`/catalog?brand=${featuredBrand.slug}`} className="link-small">View brand</Link>
            </div>
            <div className="grid">{featured.map((product) => <ProductCard key={product.id} product={product} />)}</div>
          </section>
        ) : null}

        {newIn.length ? (
          <section className="section">
            <div className="section-head">
              <div><p className="eyebrow" style={{ color: "rgba(16,16,16,.55)" }}>Just landed</p><h2 className="section-title">New in</h2></div>
              <Link href="/catalog?sort=newest" className="link-small">See all new in</Link>
            </div>
            <div className="grid">{newIn.map((product) => <ProductCard key={product.id} product={product} />)}</div>
          </section>
        ) : null}

        {under50.length ? (
          <section className="section">
            <div className="section-head">
              <div><p className="eyebrow" style={{ color: "rgba(16,16,16,.55)" }}>Budget friendly</p><h2 className="section-title">Under $50</h2></div>
              <Link href="/catalog?max=50" className="link-small">See all under $50</Link>
            </div>
            <div className="grid">{under50.map((product) => <ProductCard key={product.id} product={product} />)}</div>
          </section>
        ) : null}

        {brandGrid.length ? (
          <section className="section">
            <div className="section-head">
              <div><p className="eyebrow" style={{ color: "rgba(16,16,16,.55)" }}>Independent labels</p><h2 className="section-title">Featured brands</h2></div>
              <Link href="/brands" className="link-small">All brands</Link>
            </div>
            <div className={styles.brandGrid}>
              {brandGrid.map((brand) => (
                <Link key={brand.slug} href={`/catalog?brand=${brand.slug}`} className={styles.brandGridCard}>
                  {brand.logoUrl ? <img src={brand.logoUrl} alt={brand.name} /> : <strong>{brand.name}</strong>}
                  <span>{brand.productCount} pieces</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
      <section className="dark-section"><div className="dark-section-inner"><p className="eyebrow">Why Street</p><div><h2>Search product names, colors, fits, and styles across independent labels.</h2><p style={{ maxWidth: 520, margin: "26px 0 0", fontSize: 15, lineHeight: 1.55, color: "rgba(244,243,238,.65)" }}>When you find something, Street sends you straight to the brand website to buy it.</p></div></div></section>
      <Footer />
    </main>
  );
}
