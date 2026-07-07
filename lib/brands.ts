export type StreetBrand = {
  slug: string;
  name: string;
  storeUrl: string;
  logoUrl?: string;
  featured?: boolean;
  catalogEnabled?: boolean;
};

export const STREET_BRANDS: StreetBrand[] = [
  { slug: "seventy-four-uniform", name: "Seventy Four Uniform", storeUrl: "https://www.seventyfouruniform.com", logoUrl: "/brand-logos/seventy-four-uniform.svg", featured: true, catalogEnabled: true },
  { slug: "clutch-supply", name: "Clutch Supply", storeUrl: "https://clutchsupplyla.com", catalogEnabled: true },
  { slug: "hellstar", name: "Hellstar", storeUrl: "https://hellstar.com", catalogEnabled: true },
  { slug: "broken-planet", name: "Broken Planet", storeUrl: "https://brokenplanet.com", catalogEnabled: true },
  { slug: "bravest-studios", name: "Bravest Studios", storeUrl: "https://braveststudios.com", catalogEnabled: true },
  { slug: "plus-one-usa", name: "Plus One USA", storeUrl: "https://plusoneusa.com" },
  { slug: "slawn-made", name: "Slawn Made", storeUrl: "https://slawnmade.com" },
  { slug: "none-of-us", name: "None of Us", storeUrl: "https://noneofus.de" },
  { slug: "rr-online", name: "RR Online", storeUrl: "https://rronline.store" },
  { slug: "king-spider", name: "King Spider", storeUrl: "https://kingspider.co" },
  { slug: "pay-billions", name: "Pay Billions", storeUrl: "https://paybillions.com" },
  { slug: "pythia-clothing", name: "Pythia Clothing", storeUrl: "https://pythiaclothing.com" },
  { slug: "cold-hours", name: "Cold Hours", storeUrl: "https://coldhours.co" },
  { slug: "saint-giovani", name: "Saint Giovani", storeUrl: "https://saintgiovani.co.uk" },
  { slug: "peso-clothing", name: "Peso Clothing", storeUrl: "https://pesoclo.com" },
  { slug: "osbatt", name: "OSBATT", storeUrl: "https://osbatt.xyz" },
  { slug: "heaven-can-wait", name: "Heaven Can Wait", storeUrl: "https://heavencanwait.store" },
  { slug: "corteiz", name: "Corteiz", storeUrl: "https://corteiz.com" },
  { slug: "homage-year", name: "Homage Year", storeUrl: "https://homageyear.com" },
  { slug: "denim-tears", name: "Denim Tears", storeUrl: "https://denimtears.com" },
  { slug: "protect-ldn", name: "Protect LDN", storeUrl: "https://protectldn.com" },
  { slug: "crvdae", name: "CRVDAE", storeUrl: "https://crvdae.com" },
  { slug: "no-maintenance", name: "No Maintenance", storeUrl: "https://nomaintenance.us" },
  { slug: "sys-temic", name: "SYS-TEMIC", storeUrl: "https://sys-temic.com" },
  { slug: "6pm-season", name: "6PM Season", storeUrl: "https://6pmseason.com" },
  { slug: "unknown-london", name: "Unknown London", storeUrl: "https://unknownlondon.com" },
  { slug: "vague-studios", name: "Vague Studios", storeUrl: "https://vaguestudios.com" },
  { slug: "the-gv-gallery", name: "The GV Gallery", storeUrl: "https://thegvgallery.com" },
  { slug: "greddy-unit", name: "Greedy Unit", storeUrl: "https://greedyunit.com" },
  { slug: "ditch", name: "DITCH", storeUrl: "https://ditch.la" },
  { slug: "racer-worldwide", name: "Racer Worldwide", storeUrl: "https://racerworldwide.net" },
  { slug: "vicinity", name: "Vicinity", storeUrl: "https://vicinityclo.de" },
];

export function getBrand(slug: string) {
  return STREET_BRANDS.find((brand) => brand.slug === slug);
}
