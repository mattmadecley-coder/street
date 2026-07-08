import { Header } from "@/components/storefront";

// Rendered instantly while the async HomePage below it streams in its data,
// so visitors see the shell immediately instead of a blank screen.
export default function HomeLoading() {
  return (
    <main>
      <Header />
      <div className="shell">
        <section className="hero" style={{ background: "#e4e2da" }} />
        <div className="grid" style={{ marginTop: 40 }}>
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="card-image" style={{ background: "#e4e2da" }} />
          ))}
        </div>
      </div>
    </main>
  );
}
