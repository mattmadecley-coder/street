import { LegalPage, LegalSection, LegalList } from "@/components/legal-page";

export const metadata = {
  title: "Privacy Policy",
  description: "How Street collects, uses and protects information when you browse the Street catalog.",
};

const toc = [
  { id: "overview", title: "Overview" },
  { id: "collect", title: "Information we collect" },
  { id: "cookies", title: "Cookies and local storage" },
  { id: "use", title: "How we use information" },
  { id: "sharing", title: "Who we share it with" },
  { id: "brands", title: "Information about brands" },
  { id: "retention", title: "Retention" },
  { id: "choices", title: "Your choices and rights" },
  { id: "security", title: "Security" },
  { id: "children", title: "Children" },
  { id: "transfers", title: "International visitors" },
  { id: "changes", title: "Changes to this policy" },
  { id: "contact", title: "Contact" },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      other={{ href: "/terms", label: "Terms of Service" }}
      toc={toc}
      intro={<>This Privacy Policy explains what information Street (&ldquo;Street&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) collects when you use streetdotcom.com and related services, how we use it, and the choices you have. Street is a discovery catalog for independent streetwear brands. We do not sell products and we do not process payments.</>}
    >
      <LegalSection id="overview" title="Overview">
        <p>Street does not have customer accounts. You can browse, search, save items and build a cart without giving us your name or email. We collect limited, mostly anonymous usage data to run and improve the site and to show brands how their products perform. We do not sell your personal information.</p>
      </LegalSection>

      <LegalSection id="collect" title="Information we collect">
        <p><strong>Usage data (automatic).</strong> When you visit, we record events such as page views, search terms, filters used, products viewed, items saved or added to the cart, and clicks on outbound links to brand stores. Each event is linked to a randomly generated visitor ID and session ID stored in your browser, plus the page, the referring site, campaign (UTM) parameters, and basic device and browser information. These records do not include your name or email address.</p>
        <p><strong>Server and security logs.</strong> Our hosting and network providers process technical data such as IP address, user agent and request details to deliver the site, prevent abuse and keep it secure.</p>
        <p><strong>Analytics.</strong> We use Google Analytics 4 to measure traffic and usage. Google may collect information through cookies and similar technologies as described in Google&rsquo;s own privacy policy.</p>
        <p><strong>Brand applications and messages.</strong> If you submit the brand application form or email us, we collect what you provide, which may include brand name, your name, role, website, Instagram handle, fulfillment details, phone number, email address and notes.</p>
        <p><strong>What we do not collect.</strong> We do not collect payment card details, passwords for shoppers, or government identifiers. Purchases happen on each brand&rsquo;s own website, which has its own privacy practices.</p>
      </LegalSection>

      <LegalSection id="cookies" title="Cookies and local storage">
        <p>Street uses first-party cookies and browser storage for the following purposes:</p>
        <LegalList items={[
          <>Visitor and session identifiers (<code>street_visitor_id</code>, <code>street_session_id</code>) to count visits and recognize returning browsers. The visitor cookie lasts up to one year.</>,
          <>Attribution (<code>street_attribution</code>) to remember which site or campaign referred you.</>,
          <>Local storage entries for your cart and saved items, and for the identifiers above, so they persist between visits on your device.</>,
          <>A session cookie used only by Street&rsquo;s administrators to sign in to the admin dashboard.</>,
          <>Cookies set by Google Analytics for traffic measurement.</>,
        ]} />
        <p>We do not use advertising or retargeting pixels. You can clear or block cookies and local storage in your browser settings; the site will still work, but your cart and saved items may not persist.</p>
      </LegalSection>

      <LegalSection id="use" title="How we use information">
        <LegalList items={[
          "Operate, maintain and secure the catalog, search and cart.",
          "Understand what shoppers search for and click so we can improve relevance and discovery.",
          "Measure referrals and outbound clicks, and provide aggregated performance reports to brands.",
          "Append campaign parameters (such as utm_source=streetdotcom) to outbound links so brands can see traffic Street sends them.",
          "Review and respond to brand applications, corrections and removal requests.",
          "Detect and prevent fraud, abuse and automated traffic.",
          "Comply with legal obligations.",
        ]} />
      </LegalSection>

      <LegalSection id="sharing" title="Who we share it with">
        <p>We share information only as needed to run Street:</p>
        <LegalList items={[
          <><strong>Service providers</strong> that host and operate the site, deliver email, provide analytics, process images and help classify catalog data. They may process data only on our behalf.</>,
          <><strong>Brands.</strong> When you click through to a brand, the brand&rsquo;s site will see that you arrived from Street and any campaign parameters on the link. Brands receive aggregated or non-identifying performance data from us, not your personal information.</>,
          <><strong>Legal and safety.</strong> We may disclose information if required by law or to protect rights, safety or the integrity of the service.</>,
          <><strong>Business transfers.</strong> If Street is involved in a merger, acquisition or sale of assets, information may be transferred as part of that transaction.</>,
        ]} />
        <p>We do not sell personal information and we do not share it for cross-context behavioral advertising.</p>
      </LegalSection>

      <LegalSection id="brands" title="Information about brands">
        <p>Street lists publicly available product information from brand websites, such as product names, images, prices and availability. We may also collect publicly listed business contact details (for example a contact email on a brand&rsquo;s site) to notify the brand that it is listed, send performance reports, and invite it to claim, correct or remove its listing. Brand emails include an unsubscribe link, and any brand can ask us to stop contacting it or to remove its listing at any time by emailing the address below.</p>
      </LegalSection>

      <LegalSection id="retention" title="Retention">
        <p>We keep usage data for as long as it is useful for analytics, security and reporting, and then delete or aggregate it. Brand applications and correspondence are kept for as long as needed to handle the request and maintain our records. Browser identifiers expire as described above or when you clear them.</p>
      </LegalSection>

      <LegalSection id="choices" title="Your choices and rights">
        <LegalList items={[
          "Clear cookies and local storage in your browser at any time, or use your browser’s privacy controls.",
          "Opt out of Google Analytics with Google’s browser add-on (tools.google.com/dlpage/gaoptout).",
          "Ask us what personal information we hold about you, or to correct or delete it.",
          "Brands can ask us to correct, update or remove their listing and to stop emailing them.",
        ]} />
        <p>Depending on where you live (for example California, other U.S. states, the EEA or the UK), you may have additional rights such as access, deletion, correction, portability, and the right to object to or restrict certain processing. To exercise a right, email us. We will respond within the time required by applicable law and may need to verify your request. Because our usage data is tied to a random browser identifier rather than your identity, we may ask you to provide your visitor ID to locate it. We do not discriminate against anyone for exercising privacy rights. Street does not currently respond to Do Not Track or Global Privacy Control signals.</p>
      </LegalSection>

      <LegalSection id="security" title="Security">
        <p>We use reasonable technical and organizational measures to protect information, including encrypted connections and restricted access to our systems. No method of transmission or storage is completely secure, so we cannot guarantee absolute security.</p>
      </LegalSection>

      <LegalSection id="children" title="Children">
        <p>Street is not directed to children under 13, and we do not knowingly collect personal information from them. If you believe a child has provided us information, contact us and we will delete it.</p>
      </LegalSection>

      <LegalSection id="transfers" title="International visitors">
        <p>Street is operated from the United States, and information is processed there and in other countries where our providers operate. By using the site you understand your information may be transferred to countries whose data protection laws differ from your own.</p>
      </LegalSection>

      <LegalSection id="changes" title="Changes to this policy">
        <p>We may update this policy from time to time. The &ldquo;Last updated&rdquo; date at the top shows the latest revision, and material changes will be reflected on this page.</p>
      </LegalSection>

      <LegalSection id="contact" title="Contact">
        <p>Questions, requests or removal notices: <a href="mailto:privacy@streetdotcom.com">privacy@streetdotcom.com</a>. For the rules of using Street, see our <a href="/terms">Terms of Service</a>.</p>
      </LegalSection>
    </LegalPage>
  );
}
