import Link from "next/link";
import styles from "./brands.module.css";
import { Header } from "@/components/storefront";
import { STREET_BRANDS } from "@/lib/brands";
import { getCatalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BrandsPage() {
  const { products } = await getCatalog();
  return (
    <main>
      <Header />
      <div className="shell">
        <div className="catalog-top"><div><p className="eyebrow" style={{ color: "rgba(16,16,16,.55)" }}>Street directory</p><h1>Brands</h1></div></div>
        <div className={styles.directory}>
          {STREET_BRANDS.map((brand) => {
            const count = products.filter((product) => product.brandSlug === brand.slug).length;
            return <Link key={brand.slug} href={`/brands/${brand.slug}`} className={styles.card}><span className="brand">Brand</span><strong>{brand.name}</strong><span>{count} pieces</span></Link>;
          })}
        </div>
      </div>
    </main>
  );
}
