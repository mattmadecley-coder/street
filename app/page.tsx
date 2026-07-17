import Image from "next/image";
import Link from "next/link";
import styles from "./home.module.css";
import { Header, Footer, ProductCard } from "@/components/storefront";
import { HeroMedia } from "@/components/hero-media";
import { getCatalogPage, getDiverseProductShelf } from "@/lib/catalog-page";
import { getSiteSettings } from "@/lib/site-settings";
import { getHomepageBrandSummaries, getHomepageCategorySummaries } from "@/lib/homepage-summaries";
import { getActiveCollectionsForHomepage } from "@/lib/collections-store";
import { MEDIA_BLUR_DATA_URL } from "@/lib/media-placeholders";

export const revalidate = 3600;

export default async function HomePage() {
  const [settings, brands, categoryShowcase, newIn, under50, collections] = await Promise.all([
    getSiteSettings(),
    getHomepageBrandSummaries(),
    getHomepageCategorySummaries(8),
    getDiverseProductShelf({ sort: "newest", availability: "in_stock" }, { limit: 10, perBrandCap: 2, poolPages: 1 }),
    getDiverseProductShelf({ max: 50, sort: "newest", availability: "in_stock" }, { limit: 10, perBrandCap: 2, poolPages: 1 }),
    getActiveCollectionsForHomepage(),
  ]);

  const brandsWithStock = brands.filter((brand) => brand.productCount > 0);
  const featuredBrand = brandsWithStock.find((brand) => brand.slug === settings.featured_brand_slug) ?? brandsWithStock.find((brand) => brand.featured) ?? brandsWithStock[0];
  const featuredPage = featuredBrand ? await getCatalogPage({ brand: featuredBrand.slug, availability: "in_stock" }) : null;
  const featured = featuredPage?.products.slice(0, 6) ?? [];
  const heroVideoUrl = settings.hero_video_url || undefined;
  const heroImageUrl = settings.hero_image_url || undefined;
  const spotlightBrands = brands.filter((brand) => brand.featured && brand.productCount > 0).slice(0, 8);
  const brandGrid = (spotlightBrands.length ? spotlightBrands : brands.filter((brand) => brand.productCount > 0)).slice(0, 8);

  return (
    <main>
      <Header />
      <div className="shell">
        <section className={`hero ${styles.heroVideo}`}>
          <HeroMedia videoUrl={heroVideoUrl} imageUrl={heroImageUrl} className={styles.heroMedia} />
          {featuredBrand ? <Link href={`/brands/${featuredBrand.slug}`} className={styles.brandSpotlight} aria-label={`View ${featuredBrand.name}`}><span className={styles.brandSpotlightLabel}>{settings.featured_brand_cta_label || "Check out their collections"}</span>{featuredBrand.logoUrl ? <Image src={featuredBrand.logoUrl} alt={featuredBrand.name} width={300} height={76} sizes="(max-width: 840px) 150px, 118px" quality={75} className={styles.brandSpotlightLogo} /> : <strong>{featuredBrand.name}</strong>}</Link> : null}
        </section>
        <Link href="/catalog" className="shop-all"><span>Shop all</span><span>→</span></Link>

        {featuredBrand && featured.length ? (
          <section className="section">
            <div className="section-head"><div><p className="eyebrow" style={{ color: "rgba(16,16,16,.55)" }}>Featured brand</p><h2 className="section-title">{featuredBrand.name}</h2></div><span className="link-small">Swipe to explore →</span></div>
            <div className={styles.featuredRail}>{featured.map((product) => <div className={styles.featuredRailItem} key={product.id}><ProductCard product={product} /></div>)}<Link href={`/brands/${featuredBrand.slug}`} className={styles.viewBrandCard}><span>Explore the full collection</span>{featuredBrand.logoUrl ? <Image src={featuredBrand.logoUrl} alt={featuredBrand.name} width={260} height={90} /> : <strong>{featuredBrand.name}</strong>}<em>View brand →</em></Link></div>
          </section>
        ) : null}

        {categoryShowcase.length ? <section className="section"><div className="section-head"><div><p className="eyebrow" style={{ color: "rgba(16,16,16,.55)" }}>Browse</p><h2 className="section-title">Shop by category</h2></div></div><div className={styles.categoryGrid}>{categoryShowcase.map((item) => <Link key={`${item.group}-${item.category}`} href={`/catalog?group=${encodeURIComponent(item.group)}&category=${encodeURIComponent(item.category)}`} className={styles.categoryTile}>{item.imageUrl ? <Image src={item.imageUrl} alt={item.category} fill loading="lazy" fetchPriority="low" quality={72} sizes="(max-width: 840px) 50vw, 25vw" placeholder="blur" blurDataURL={MEDIA_BLUR_DATA_URL} /> : <div className={styles.categoryTileFallback} />}<span className={styles.categoryTileLabel}><strong>{item.category}</strong><em>{item.count} piece{item.count === 1 ? "" : "s"}</em></span></Link>)}</div></section> : null}

        {collections.map((collection) => <section className="section" key={collection.slug}><div className="section-head"><div><p className="eyebrow" style={{ color: "rgba(16,16,16,.55)" }}>Collection</p><h2 className="section-title">{collection.title}</h2></div><Link href={`/collections/${collection.slug}`} className="link-small">View collection</Link></div><div className="grid">{collection.products.slice(0, 8).map((product) => <ProductCard key={product.id} product={product} />)}</div></section>)}

        {newIn.length ? <section className="section"><div className="section-head"><div><p className="eyebrow" style={{ color: "rgba(16,16,16,.55)" }}>Just landed</p><h2 className="section-title">New in</h2></div><Link href="/catalog?sort=newest" className="link-small">See all new in</Link></div><div className="grid">{newIn.map((product) => <ProductCard key={product.id} product={product} />)}</div></section> : null}
        {under50.length ? <section className="section"><div className="section-head"><div><p className="eyebrow" style={{ color: "rgba(16,16,16,.55)" }}>Budget friendly</p><h2 className="section-title">Under $50</h2></div><Link href="/catalog?max=50" className="link-small">See all under $50</Link></div><div className="grid">{under50.map((product) => <ProductCard key={product.id} product={product} />)}</div></section> : null}

        {brandGrid.length ? <section className="section"><div className="section-head"><div><p className="eyebrow" style={{ color: "rgba(16,16,16,.55)" }}>Independent labels</p><h2 className="section-title">Featured brands</h2></div><Link href="/brands" className="link-small">All brands</Link></div><div className={styles.brandGrid}>{brandGrid.map((brand) => <Link key={brand.slug} href={`/brands/${brand.slug}`} className={styles.brandGridCard}>{brand.logoUrl ? <Image src={brand.logoUrl} alt={brand.name} width={320} height={80} sizes="(max-width: 840px) 42vw, 20vw" quality={70} loading="lazy" /> : <strong>{brand.name}</strong>}<span>{brand.productCount} pieces</span></Link>)}</div></section> : null}
      </div>
      <section className="dark-section"><div className="dark-section-inner"><p className="eyebrow">Why Street</p><div><h2>Search product names, colors, fits, and styles across independent labels.</h2><p style={{ maxWidth: 520, margin: "26px 0 0", fontSize: 15, lineHeight: 1.55, color: "rgba(244,243,238,.65)" }}>When you find something, Street sends you straight to the brand website to buy it.</p></div></div></section>
      <Footer />
    </main>
  );
}
