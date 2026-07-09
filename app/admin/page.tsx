import Link from "next/link";
import styles from "./admin.module.css";
import { AdminNav } from "@/components/admin/admin-nav";
import { hasSupabaseCatalog, supabaseRestPage } from "@/lib/supabase-rest";

export const dynamic = "force-dynamic";

async function count(path: string) {
  if (!hasSupabaseCatalog()) return 0;
  try {
    const result = await supabaseRestPage(path, { from: 0, to: 0 }, { noStore: true });
    return result.total;
  } catch {
    return 0;
  }
}

export default async function AdminOverviewPage() {
  const [products, needsReview, pending, brands] = await Promise.all([
    count("products?select=id&is_active=eq.true"),
    count("products?select=id&is_active=eq.true&classification_status=eq.needs_review"),
    count("products?select=id&is_active=eq.true&classification_status=eq.pending"),
    count("brands?select=id&is_active=eq.true"),
  ]);

  return (
    <div className={styles.shell}>
      <AdminNav active="/admin" />
      <h1 className={styles.title}>Overview</h1>
      <p className={styles.subtitle}>Manage the parts of Street that live behind the scenes.</p>

      <div className={styles.cardGrid}>
        <div className={styles.statCard}><strong>{products.toLocaleString()}</strong><span>Active products</span></div>
        <div className={styles.statCard}><strong>{needsReview.toLocaleString()}</strong><span>Need review</span></div>
        <div className={styles.statCard}><strong>{pending.toLocaleString()}</strong><span>Pending classification</span></div>
        <div className={styles.statCard}><strong>{brands.toLocaleString()}</strong><span>Brands</span></div>
      </div>

      <div className={styles.linkGrid}>
        <Link href="/admin/homepage" className={styles.linkCard}>
          <h3>Homepage</h3>
          <p>Swap the hero image/video and choose which brand the spotlight links to.</p>
        </Link>
        <Link href="/admin/brands" className={styles.linkCard}>
          <h3>Brands</h3>
          <p>Fix a wrong logo, update a store link, or feature a brand on the homepage.</p>
        </Link>
        <Link href={`/admin/products?status=needs_review`} className={styles.linkCard}>
          <h3>Products</h3>
          <p>Override a product&rsquo;s category or tags when the AI classifier got it wrong.</p>
        </Link>
        <Link href="/admin/analytics" className={styles.linkCard}>
          <h3>Analytics</h3>
          <p>Searches, category popularity, price ranges, and outbound clicks to brands.</p>
        </Link>
      </div>
    </div>
  );
}
