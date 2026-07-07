import Link from "next/link";
import styles from "./home.module.css";
import { Header, ProductCard } from "@/components/storefront";
import { getCatalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const heroVideoUrl = process.env.NEXT_PUBLIC_HERO_VIDEO_URL;

export default async function HomePage() {
  const { products } = await getCatalog();
  const featured = products.filter((product) => product.stockStatus === "in_stock").slice(0, 8);

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
            <img className={styles.heroMedia} src="/hero-placeholder.svg" alt="Street hero media placeholder" />
          )}
          <div className={styles.heroShade} />
          <div className="hero-copy">
            <p className="eyebrow">Independent streetwear, one catalog</p>
            <h1>Discover independent pieces in one place.</h1>
          </div>
          <Link href="/brands/seventy-four-uniform" className={styles.brandSpotlight} aria-label="Check out Seventy Four Uniform collections">
            <span className={styles.brandSpotlightLabel}>Check out their collections</span>
            <span className={styles.brandSpotlightLogoWrap}><img src="/brand-logos/seventy-four-uniform.svg" alt="Seventy Four Uniform" className={styles.brandSpotlightLogo} /></span>
            <span className={styles.brandSpotlightArrow}>↗</span>
          </Link>
        </section>
        <Link href="/catalog" className="shop-all"><span>Shop all</span><span>→</span></Link>
        <section className="section">
          <div className="section-head">
            <div><p className="eyebrow" style={{ color: "rgba(16,16,16,.55)" }}>First brand</p><h2 className="section-title">Seventy Four Uniform</h2></div>
            <Link href="/brands/seventy-four-uniform" className="link-small">View brand</Link>
          </div>
          <div className="grid">{featured.map((product) => <ProductCard key={product.id} product={product} />)}</div>
        </section>
      </div>
      <section className="dark-section"><div className="dark-section-inner"><p className="eyebrow">Why Street</p><div><h2>Search product names, colors, fits, and styles across independent labels.</h2><p style={{ maxWidth: 520, margin: "26px 0 0", fontSize: 15, lineHeight: 1.55, color: "rgba(244,243,238,.65)" }}>When you find something, Street sends you straight to the brand website to buy it.</p></div></div></section>
    </main>
  );
}
