import { NextRequest, NextResponse } from "next/server";
import { hasPermission } from "@/lib/admin-guard";
import { hasSupabaseCatalog, supabaseRest } from "@/lib/supabase-rest";

export const dynamic = "force-dynamic";

/** Quick-find backing the admin command palette (Ctrl+K). Admin-only. */
export async function GET(request: NextRequest) {
  if (!(await hasPermission("view"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // PostgREST filter syntax treats * , ( ) specially; strip them from user input.
  const term = (request.nextUrl.searchParams.get("q") ?? "").replace(/[*,()%\\]/g, " ").trim().slice(0, 60);
  if (term.length < 2 || !hasSupabaseCatalog()) return NextResponse.json({ brands: [], products: [] });

  const pattern = encodeURIComponent(`*${term}*`);
  try {
    const [brands, products] = await Promise.all([
      supabaseRest<Array<{ slug: string; name: string }>>(`brands?select=slug,name&name=ilike.${pattern}&order=name.asc&limit=5`, { noStore: true }),
      supabaseRest<Array<{ id: string; title: string; brands: { name: string } | null }>>(`products?select=id,title,brands(name)&title=ilike.${pattern}&is_active=eq.true&limit=6`, { noStore: true }),
    ]);
    return NextResponse.json({
      brands,
      products: products.map((product) => ({ id: product.id, title: product.title, brand: product.brands?.name ?? null })),
    });
  } catch {
    return NextResponse.json({ brands: [], products: [] });
  }
}
