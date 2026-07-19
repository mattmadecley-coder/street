import Link from "next/link";
import styles from "./brands.module.css";
import { Header, Footer } from "@/components/storefront";
import { CatalogImage } from "@/components/catalog-image";
import { getBrandDirectory } from "@/lib/catalog-store";

export const revalidate = 3600;

function instagramHandle(url: string | null) {
  if (!url) return null;
  try { return new URL(url).pathname.split("/").filter(Boolean)[0] ?? null; } catch { return null; }
}

export default async function BrandsPage() {
  const brands = await getBrandDirectory();
  return (
    <main>
      <Header />
      <div className="shell">
        <div className="catalog-top"><div><p className="eyebrow" style={{ color: "rgba(16,16,16,.55)" }}>Street directory</p><h1>Brands</h1></div></div>
        <div className={styles.directory}>
          {brands.map((brand) => {
            const body = <><div className={styles.logoArea}>{brand.logoUrl ? <CatalogImage src={brand.logoUrl} widthHint={520} fallback={<strong>{brand.name}</strong>} alt={brand.name} width={420} height={140} sizes="(max-width: 840px) 45vw, 260px" /> : <strong>{brand.name}</strong>}</div><span>{brand.productCount ? `${brand.productCount} pieces` : "Catalog coming soon"}</span>{instagramHandle(brand.instagramUrl) ? <p className={styles.instagram}>@{instagramHandle(brand.instagramUrl)}</p> : null}</>;
            return brand.productCount > 0 ? <Link href={`/brands/${brand.slug}`} className={styles.card} key={brand.slug}>{body}</Link> : <div className={`${styles.card} ${styles.cardDisabled}`} key={brand.slug}>{body}</div>;
          })}
        </div>
      </div>
      <Footer />
    </main>
  );
}
