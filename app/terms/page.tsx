import { LegalPage, LegalSection, LegalList } from "@/components/legal-page";

export const metadata = {
  title: "Terms of Service",
  description: "The terms that apply when you use Street, a discovery catalog for independent streetwear brands.",
};

const toc = [
  { id: "agreement", title: "Agreement to these terms" },
  { id: "service", title: "What Street is" },
  { id: "purchases", title: "Purchases happen on brand sites" },
  { id: "accuracy", title: "Product information" },
  { id: "use", title: "Acceptable use" },
  { id: "ip", title: "Intellectual property" },
  { id: "brands", title: "Brands: listings, claims and removal" },
  { id: "links", title: "Third-party links" },
  { id: "disclaimers", title: "Disclaimers" },
  { id: "liability", title: "Limitation of liability" },
  { id: "indemnity", title: "Indemnification" },
  { id: "termination", title: "Suspension and termination" },
  { id: "law", title: "Governing law and disputes" },
  { id: "changes", title: "Changes to these terms" },
  { id: "contact", title: "Contact" },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      other={{ href: "/privacy", label: "Privacy Policy" }}
      toc={toc}
      intro={<>These Terms of Service (&ldquo;Terms&rdquo;) govern your use of streetdotcom.com and related services (the &ldquo;Site&rdquo;) operated by Street (&ldquo;Street&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). Please read them carefully.</>}
    >
      <LegalSection id="agreement" title="Agreement to these terms">
        <p>By accessing or using the Site you agree to these Terms and to our <a href="/privacy">Privacy Policy</a>. If you do not agree, do not use the Site. You must be old enough to form a binding contract where you live, or use the Site with a parent or guardian&rsquo;s permission.</p>
      </LegalSection>

      <LegalSection id="service" title="What Street is">
        <p>Street is a discovery catalog that aggregates publicly available product listings from independent streetwear brands so you can search and browse them in one place. Street is not a retailer. We do not sell, ship or hold inventory, and we do not process payments for products. Street is not affiliated with, sponsored by or endorsed by the brands listed, unless a listing says otherwise.</p>
      </LegalSection>

      <LegalSection id="purchases" title="Purchases happen on brand sites">
        <p>When you choose to buy, you are taken to the brand&rsquo;s own website, and your purchase is a contract between you and that brand. The brand is solely responsible for pricing, taxes, payment, fulfillment, shipping, returns, refunds, warranties and customer service. Street is not a party to those transactions and is not liable for them. Review the brand&rsquo;s own terms and policies before you buy.</p>
        <p>Items you add to a Street cart or save are a convenience for organizing what you want; they are not an order and do not reserve inventory or a price.</p>
      </LegalSection>

      <LegalSection id="accuracy" title="Product information">
        <p>Product names, images, descriptions, prices, sizes and stock status are collected from brand websites on a periodic schedule and may be incomplete, outdated or wrong. Always confirm price, availability and details on the brand&rsquo;s checkout before buying. Product categories, tags and search results may be generated or ranked with automated tools and can contain errors.</p>
      </LegalSection>

      <LegalSection id="use" title="Acceptable use">
        <p>You agree not to:</p>
        <LegalList items={[
          "Use the Site in violation of any law or regulation.",
          "Scrape, crawl, copy or harvest the Site or its data at scale, or build a competing database from it, without our written permission.",
          "Use bots or automated means to inflate clicks, views, searches or other metrics, or to manipulate rankings or reports.",
          "Interfere with or disrupt the Site, its servers or networks, or attempt to gain unauthorized access.",
          "Probe, scan or test the vulnerability of the Site, or bypass security or access controls.",
          "Submit false, misleading or infringing information, including in brand applications or removal requests.",
          "Impersonate any person or brand, or misrepresent your affiliation with one.",
        ]} />
      </LegalSection>

      <LegalSection id="ip" title="Intellectual property">
        <p>The Site&rsquo;s design, code, layout, compilation and the Street name and marks belong to Street or its licensors and are protected by law. Product names, images, descriptions, trademarks and logos shown in the catalog belong to their respective brands and owners and are displayed to help you discover and reach those brands. Nothing in these Terms grants you any right in them.</p>
        <p>You may use the Site for personal, non-commercial purposes. Any feedback you send us may be used by us without restriction or compensation.</p>
        <p><strong>Copyright complaints.</strong> If you believe content on the Site infringes your copyright, email <a href="mailto:terms@streetdotcom.com">terms@streetdotcom.com</a> with: your contact information; a description of the work; the URL of the material; a statement that you have a good-faith belief the use is unauthorized; and a statement, under penalty of perjury, that your notice is accurate and that you are the owner or authorized to act for the owner. We will review and may remove material promptly, and we may end access for repeat infringers.</p>
      </LegalSection>

      <LegalSection id="brands" title="Brands: listings, claims and removal">
        <p>If you operate or represent a brand listed on Street, you may ask us at any time to correct your information, claim your listing, or remove your catalog, and to stop contacting you. Email <a href="mailto:terms@streetdotcom.com">terms@streetdotcom.com</a> from an address connected to the brand or with other reasonable proof of authority, and we will act on verified requests promptly.</p>
        <p>By applying to be featured, or by claiming a listing, you confirm that you have authority to act for the brand and that the information you provide is accurate. Any paid placement, promotion or commercial arrangement will be governed by a separate written agreement. Unless such an agreement says otherwise, Street makes no guarantee of traffic, sales, rankings or placement, and appearing in the catalog does not imply any endorsement.</p>
        <p>Performance reports and metrics we share with brands are estimates based on activity on the Site and are provided as is.</p>
      </LegalSection>

      <LegalSection id="links" title="Third-party links">
        <p>The Site links to websites and services we do not own or control, including brand stores. We do not endorse them and are not responsible for their content, security, privacy practices or availability. Outbound links may include tracking parameters that identify Street as the referrer. Your use of third-party sites is at your own risk and subject to their terms.</p>
      </LegalSection>

      <LegalSection id="disclaimers" title="Disclaimers">
        <p>THE SITE AND ALL CONTENT ARE PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo;, WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, ACCURACY AND AVAILABILITY. WE DO NOT WARRANT THAT THE SITE WILL BE UNINTERRUPTED, ERROR-FREE OR SECURE, OR THAT PRODUCT INFORMATION IS ACCURATE, COMPLETE OR CURRENT. WE DO NOT WARRANT ANY PRODUCT OR SERVICE OFFERED BY A BRAND.</p>
      </LegalSection>

      <LegalSection id="liability" title="Limitation of liability">
        <p>TO THE FULLEST EXTENT PERMITTED BY LAW, STREET AND ITS OWNERS, OFFICERS, EMPLOYEES AND SERVICE PROVIDERS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, DATA OR GOODWILL, ARISING FROM OR RELATED TO YOUR USE OF THE SITE OR ANY PURCHASE FROM A BRAND, EVEN IF ADVISED OF THE POSSIBILITY. OUR TOTAL LIABILITY FOR ANY CLAIM RELATING TO THE SITE WILL NOT EXCEED ONE HUNDRED U.S. DOLLARS (US$100). Some jurisdictions do not allow certain limitations, so some of the above may not apply to you.</p>
      </LegalSection>

      <LegalSection id="indemnity" title="Indemnification">
        <p>You agree to defend, indemnify and hold harmless Street and its owners, officers, employees and service providers from claims, damages, liabilities and expenses (including reasonable attorneys&rsquo; fees) arising from your violation of these Terms, your misuse of the Site, or your infringement of any third party&rsquo;s rights.</p>
      </LegalSection>

      <LegalSection id="termination" title="Suspension and termination">
        <p>We may suspend or restrict access to the Site, or block automated or abusive traffic, at any time and without notice if we believe you have violated these Terms or if needed to protect the Site. We may also modify or discontinue the Site or any part of it. Sections that by their nature should survive termination (including intellectual property, disclaimers, limitation of liability, indemnification and governing law) will survive.</p>
      </LegalSection>

      <LegalSection id="law" title="Governing law and disputes">
        <p>These Terms are governed by the laws of the United States and the State of Delaware, without regard to conflict-of-law rules. Any dispute that cannot be resolved informally will be brought exclusively in the state or federal courts located in Delaware, and you consent to their jurisdiction. Before filing a claim, you agree to contact us and try to resolve the dispute informally for at least 30 days. To the extent permitted by law, claims must be brought on an individual basis and not as part of a class or representative action, and must be filed within one year after the claim arose.</p>
      </LegalSection>

      <LegalSection id="changes" title="Changes to these terms">
        <p>We may update these Terms from time to time. The &ldquo;Last updated&rdquo; date at the top shows the latest revision. Continued use of the Site after changes take effect means you accept the updated Terms. If any provision is found unenforceable, the rest remain in effect. These Terms and the Privacy Policy are the entire agreement between you and Street regarding the Site.</p>
      </LegalSection>

      <LegalSection id="contact" title="Contact">
        <p>Questions about these Terms, copyright notices or brand requests: <a href="mailto:terms@streetdotcom.com">terms@streetdotcom.com</a>. Privacy questions: <a href="mailto:privacy@streetdotcom.com">privacy@streetdotcom.com</a>.</p>
      </LegalSection>
    </LegalPage>
  );
}
