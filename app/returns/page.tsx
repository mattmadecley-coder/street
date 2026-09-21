import { Header, Footer } from "@/components/storefront";

export const metadata = { title: "Shipping & Returns" };

export default function ReturnsPage() {
  return (
    <main>
      <Header />
      <div className="shell" style={{ maxWidth: 720 }}>
        <div className="catalog-top"><div><p className="eyebrow" style={{ color: "rgba(16,16,16,.55)" }}>Help</p><h1>Shipping &amp; returns</h1></div></div>

        <div style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(16,16,16,.8)", display: "flex", flexDirection: "column", gap: 26, paddingBottom: 60 }}>
          <section>
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>How buying on Street works today</h2>
            <p>Street is a discovery site, not a store &mdash; when you buy something, you&rsquo;re taken to that brand&rsquo;s own website to complete the purchase, and your order is placed directly with them, not with Street. That means shipping, payment, order confirmation, and everything after checkout is handled entirely by the brand, using their own systems and policies.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>Shipping</h2>
            <p>Shipping costs, carriers, and delivery times are set by each individual brand and vary from one to the next. You&rsquo;ll see the brand&rsquo;s shipping details at their checkout before you pay &mdash; Street doesn&rsquo;t set or collect shipping fees, and doesn&rsquo;t ship anything itself.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>Returns &amp; exchanges</h2>
            <p>Because your order is with the brand, returns and exchanges follow that brand&rsquo;s own return policy &mdash; not Street&rsquo;s. Most brands post their return window and process on their own site (often linked in their site footer or order confirmation email). If you can&rsquo;t find it, the fastest path is to contact the brand directly using the confirmation email they sent when you checked out.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>Order status, tracking &amp; customer service</h2>
            <p>Street doesn&rsquo;t have access to your order, payment, or shipment &mdash; we never see that information, since checkout happens on the brand&rsquo;s site. For anything about an order you placed &mdash; tracking, a late package, a damaged item, a refund &mdash; reach out to that brand&rsquo;s customer service directly rather than contacting Street.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>What if a listing looks wrong?</h2>
            <p>Prices, stock, and sizing on Street are synced from each brand&rsquo;s store on a regular schedule, so they can occasionally lag behind &mdash; always confirm the final price and availability on the brand&rsquo;s own checkout page before you buy. If a listing looks broken or clearly wrong, let us know at <a href="mailto:mattmadecley@gmail.com">mattmadecley@gmail.com</a> and we&rsquo;ll take a look.</p>
          </section>

          <section>
            <p style={{ fontSize: 12, color: "rgba(16,16,16,.5)" }}>Last updated {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}. This page reflects how Street works right now; if that changes &mdash; for example, if checkout ever moves onto Street itself &mdash; this page will be updated to match.</p>
          </section>
        </div>
      </div>
      <Footer />
    </main>
  );
}
