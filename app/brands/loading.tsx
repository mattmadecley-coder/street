import { Header } from "@/components/storefront";
import styles from "./brands.module.css";

export default function BrandsLoading() {
  return (
    <main>
      <Header />
      <div className="shell">
        <div className="catalog-top">
          <div>
            <p className="eyebrow" style={{ color: "rgba(16,16,16,.55)" }}>Street directory</p>
            <h1>Brands</h1>
          </div>
        </div>
        <div className={styles.directory}>
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className={styles.card} style={{ background: "#f3f2ee" }} />
          ))}
        </div>
      </div>
    </main>
  );
}
