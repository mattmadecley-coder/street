import Link from "next/link";
import styles from "./brands.module.css";
import { Header } from "@/components/storefront";
import { getBrandDirectory } from "@/lib/catalog-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BrandsPage() {
  const brands = await getBrandDirectory();
  return (
    <main>
      <Header />
      <div className="shell">
        <div className="catalog-top"><div><p className="eyebrow" style={{ color: "rgba(16,16,16,.55)" }}>Street directory</p><h1>Brands</h1></div></div>
        <div className={styles.directory}>{brands.map((brand) => <div className={styles.card} key={brand.slug}><div className={styles.logoArea}>{brand.logoUrl ? <img src={brand.logoUrl} alt={brand.name} /> : <strong>{brand.name}</strong>}</div><span>{brand.productCount ? `${brand.productCount} pieces` : "Catalog coming soon"}</span></div>)}</div>
      </div>
    </main>
  );
}
