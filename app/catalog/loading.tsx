import { Header } from "@/components/storefront";

export default function CatalogLoading() {
  return (
    <main>
      <Header />
      <div className="shell">
        <div className="catalog-top">
          <div>
            <p className="eyebrow" style={{ color: "rgba(16,16,16,.55)" }}>Street catalog</p>
            <h1>Shop all</h1>
          </div>
        </div>
        <div className="grid" style={{ marginTop: 30 }}>
          {Array.from({ length: 12 }).map((_, index) => (
            <div key={index} className="card-image" style={{ background: "#e4e2da" }} />
          ))}
        </div>
      </div>
    </main>
  );
}
