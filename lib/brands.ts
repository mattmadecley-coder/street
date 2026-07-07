export type StreetBrand = {
  slug: string;
  name: string;
  storeUrl: string;
  logoUrl?: string;
  featured?: boolean;
};

export const STREET_BRANDS: StreetBrand[] = [
  {
    slug: "seventy-four-uniform",
    name: "Seventy Four Uniform",
    storeUrl: "https://www.seventyfouruniform.com",
    logoUrl: "/brand-logos/seventy-four-uniform.svg",
    featured: true,
  },
  {
    slug: "clutch-supply",
    name: "Clutch Supply",
    storeUrl: "https://clutchsupplyla.com",
  },
];

export function getBrand(slug: string) {
  return STREET_BRANDS.find((brand) => brand.slug === slug);
}
