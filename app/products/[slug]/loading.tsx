import { Header } from "@/components/storefront";

export default function ProductLoading() {
  return (
    <main>
      <Header />
      <div className="shell product-layout">
        <section className="gallery" aria-hidden>
          <div style={{ background: "#e4e2da" }} />
        </section>
        <aside className="product-info">
          <div style={{ height: 12, width: 100, background: "#e4e2da", marginBottom: 14 }} />
          <div style={{ height: 40, width: "80%", background: "#e4e2da", marginBottom: 14 }} />
          <div style={{ height: 18, width: 70, background: "#e4e2da" }} />
        </aside>
      </div>
    </main>
  );
}
