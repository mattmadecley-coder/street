import Link from "next/link";
import { Header } from "@/components/storefront";

export default function NotFound() {
  return (
    <main>
      <Header />
      <div className="shell" style={{ display: "grid", placeItems: "center", minHeight: "50vh", textAlign: "center", gap: 14 }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(16,16,16,.55)", marginBottom: 8 }}>404</p>
          <h1 style={{ fontSize: 32, letterSpacing: "-.03em", margin: "0 0 10px" }}>We couldn&rsquo;t find that page</h1>
          <p style={{ fontSize: 14, color: "rgba(16,16,16,.65)", margin: "0 0 20px" }}>It may have moved, or the link was off. Try shopping the full catalog instead.</p>
          <Link href="/catalog" style={{ display: "inline-block", height: 42, lineHeight: "42px", padding: "0 22px", background: "#101010", color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", textDecoration: "none" }}>Shop all</Link>
        </div>
      </div>
    </main>
  );
}
