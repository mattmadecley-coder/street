import { NextResponse } from "next/server";
import { getAllBrands } from "@/lib/catalog-store";

export async function GET() {
  const brands = (await getAllBrands())
    .filter((brand) => brand.productCount > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ slug, name }) => ({ slug, name }));
  return NextResponse.json({ brands }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
