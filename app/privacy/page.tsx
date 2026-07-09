import { Header, Footer } from "@/components/storefront";

export const metadata = { title: "Privacy & Terms" };

export default function PrivacyPage() {
  return (
    <main>
      <Header />
      <div className="shell" style={{ maxWidth: 720 }}>
        <div className="catalog-top"><div><p className="eyebrow" style={{ color: "rgba(16,16,16,.55)" }}>Legal</p><h1>Privacy &amp; terms</h1></div></div>

        <div style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(16,16,16,.8)", display: "flex", flexDirection: "column", gap: 26, paddingBottom: 60 }}>
          <section>
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>What Street is</h2>
            <p>Street is a discovery site for independent streetwear brands. We aggregate product listings from each brand&rsquo;s own store so you can search and browse them in one place. Street doesn&rsquo;t sell anything, process payments, or hold inventory — when you click through to a product, you&rsquo;re taken to that brand&rsquo;s own website to buy it. Street isn&rsquo;t affiliated with, sponsored by, or endorsed by any of the brands listed here; product names, images, and prices belong to their respective brands.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>Data we collect</h2>
            <p>We keep basic, anonymous usage analytics to understand how people use Street: page views, search terms, which products get clicked from a search, which categories and price ranges are popular, and which outbound brand links get clicked. We also log the referring site that sent you here. None of this is tied to a name, email, or account — Street doesn&rsquo;t have user accounts, and we don&rsquo;t collect payment information, since all purchases happen on the brand&rsquo;s own site.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>Cookies</h2>
            <p>Street sets one cookie: a session cookie for the admin dashboard, used only by the site owner to manage the catalog. Nothing on the public site sets tracking or advertising cookies.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>Product data accuracy</h2>
            <p>Prices, stock status, and sizing shown on Street are pulled from each brand&rsquo;s store on a regular schedule, but they can lag behind the brand&rsquo;s live site — always confirm price and availability on the brand&rsquo;s own checkout before buying. Street isn&rsquo;t responsible for a brand&rsquo;s order fulfillment, returns, or customer service; those are between you and the brand.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>Brand removal requests</h2>
            <p>If you run one of the brands listed here and would like your catalog removed from Street, or have any other question about this policy, reach out at <a href="mailto:mattmadecley@gmail.com">mattmadecley@gmail.com</a>.</p>
          </section>

          <section>
            <p style={{ fontSize: 12, color: "rgba(16,16,16,.5)" }}>Last updated {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.</p>
          </section>
        </div>
      </div>
      <Footer />
    </main>
  );
}
