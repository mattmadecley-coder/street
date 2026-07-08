import { NextRequest, NextResponse } from "next/server";
import { logOutboundClick, resolveOutboundDestination } from "@/lib/outbound-clicks";

// Every "Shop at {brand}" button routes through here instead of linking
// straight to the brand's site. That's what lets Street eventually show each
// brand exactly how much traffic it sends them (README "Next build priorities").
export async function GET(request: NextRequest) {
  const to = request.nextUrl.searchParams.get("to");
  const brand = request.nextUrl.searchParams.get("brand");
  const product = request.nextUrl.searchParams.get("product") ?? undefined;

  const destination = resolveOutboundDestination(brand, to);
  if (!destination || !brand) {
    return NextResponse.json({ ok: false, error: "Unrecognized or disallowed destination." }, { status: 400 });
  }

  await logOutboundClick({ brandSlug: brand, productSlug: product, destinationUrl: destination.toString() });
  return NextResponse.redirect(destination, 307);
}
