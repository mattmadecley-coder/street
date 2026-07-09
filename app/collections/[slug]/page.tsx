import { notFound } from "next/navigation";
import { Header, Footer, ProductCard } from "@/components/storefront";
import { getPublicCollection } from "@/lib/collections-store";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = await getPublicCollection(slug);
  if (!collection) return {};
  return { title: collection.title };
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = await getPublicCollection(slug);
  if (!collection) return notFound();

  return (
    <main>
      <Header />
      <div className="shell">
        <div className="catalog-top">
          <div>
            <p className="eyebrow" style={{ color: "rgba(16,16,16,.55)" }}>Collection</p>
            <h1>{collection.title}</h1>
            {collection.subtitle ? <p style={{ margin: "8px 0 0", fontSize: 14, color: "rgba(16,16,16,.65)", maxWidth: 560 }}>{collection.subtitle}</p> : null}
          </div>
        </div>
        <p className="results">{collection.products.length} piece{collection.products.length === 1 ? "" : "s"}</p>
        <div className="grid">{collection.products.map((product) => <ProductCard key={product.id} product={product} />)}</div>
      </div>
      <Footer />
    </main>
  );
}
