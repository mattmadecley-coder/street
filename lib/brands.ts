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
  { slug: "plus-one-usa", name: "Plus One USA", storeUrl: "https://plusoneusa.com", catalogEnabled: true },
  { slug: "slawn-made", name: "Slawn Made", storeUrl: "https://slawnmade.com", catalogEnabled: true },
  { slug: "none-of-us", name: "None of Us", storeUrl: "https://noneofus.de", catalogEnabled: true },
  { slug: "rr-online", name: "RR Online", storeUrl: "https://rronline.store", catalogEnabled: true },
  { slug: "king-spider", name: "King Spider", storeUrl: "https://kingspider.co", catalogEnabled: true },
  { slug: "pay-billions", name: "Pay Billions", storeUrl: "https://paybillions.com", catalogEnabled: true },
  { slug: "pythia-clothing", name: "Pythia Clothing", storeUrl: "https://pythiaclothing.com", catalogEnabled: true },
  { slug: "cold-hours", name: "Cold Hours", storeUrl: "https://coldhours.co", catalogEnabled: true },
  { slug: "saint-giovani", name: "Saint Giovani", storeUrl: "https://saintgiovani.co.uk", catalogEnabled: true },
  { slug: "peso-clothing", name: "Peso Clothing", storeUrl: "https://pesoclo.com", catalogEnabled: true },
  { slug: "osbatt", name: "OSBATT", storeUrl: "https://osbatt.xyz", catalogEnabled: true },
  { slug: "heaven-can-wait", name: "Heaven Can Wait", storeUrl: "https://heavencanwait.store", catalogEnabled: true },
  { slug: "corteiz", name: "Corteiz", storeUrl: "https://corteiz.com", catalogEnabled: true },
  { slug: "homage-year", name: "Homage Year", storeUrl: "https://homageyear.com", catalogEnabled: true },
  { slug: "denim-tears", name: "Denim Tears", storeUrl: "https://denimtears.com", catalogEnabled: true },
  { slug: "protect-ldn", name: "Protect LDN", storeUrl: "https://protectldn.com", catalogEnabled: true },
  { slug: "crvdae", name: "CRVDAE", storeUrl: "https://crvdae.com", catalogEnabled: true },
  { slug: "no-maintenance", name: "No Maintenance", storeUrl: "https://nomaintenance.us", catalogEnabled: true },
  { slug: "sys-temic", name: "SYS-TEMIC", storeUrl: "https://sys-temic.com", catalogEnabled: true },
  { slug: "6pm-season", name: "6PM Season", storeUrl: "https://6pmseason.com", catalogEnabled: true },
  { slug: "unknown-london", name: "Unknown London", storeUrl: "https://unknownlondon.com", catalogEnabled: true },
  { slug: "vague-studios", name: "Vague Studios", storeUrl: "https://vaguestudios.com", catalogEnabled: true },
  { slug: "the-gv-gallery", name: "The GV Gallery", storeUrl: "https://thegvgallery.com", catalogEnabled: true },
  { slug: "greddy-unit", name: "Greedy Unit", storeUrl: "https://greedyunit.com", catalogEnabled: true },
  { slug: "ditch", name: "DITCH", storeUrl: "https://ditch.la", catalogEnabled: true },
  { slug: "racer-worldwide", name: "Racer Worldwide", storeUrl: "https://racerworldwide.net", catalogEnabled: true },
  { slug: "vicinity", name: "Vicinity", storeUrl: "https://vicinityclo.de", catalogEnabled: true },
];

export function getBrand(slug: string) {
  return STREET_BRANDS.find((brand) => brand.slug === slug);
}
