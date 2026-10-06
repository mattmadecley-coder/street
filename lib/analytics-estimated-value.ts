// Weighted "estimated value": a more realistic companion to Intent value.
//
// Intent value counts the full listed price of every clicked product. Not
// every click (or even every checkout) turns into a sale, so this weights each
// shopper+product by the furthest step that shopper reached:
//   clicked through to the store  -> CLICK_WEIGHT of the price
//   added it to their StreetBag   -> BAG_WEIGHT
//   clicked checkout for that brand -> CHECKOUT_WEIGHT
// These are rough industry rules of thumb (typical store conversion ~2-3%,
// cart abandonment ~70%), NOT measured Street conversion rates. Adjust them
// once real sales data comes back from brands.

export const ESTIMATE_WEIGHTS = { click: 0.03, bag: 0.12, checkout: 0.4 } as const;

type EventLike = {
  event_type: string;
  anonymous_user_id: string | null;
  product_id: string | null;
  brand_slug: string | null;
  price: number | string | null;
  metadata?: unknown;
};
type ClickLike = { anonymous_user_id: string | null; product_id: string | null; brand_slug: string | null; product_price: number | string | null };

const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export function estimateWeightedValue(events: EventLike[], clicks: ClickLike[]) {
  const items = new Map<string, { shopper: string; brand: string; price: number; weight: number }>();
  const bump = (shopper: string | null, productId: string | null, brand: string | null, price: number, weight: number) => {
    if (!shopper || !productId || !price) return;
    const key = `${shopper}::${productId}`;
    const existing = items.get(key);
    if (!existing) items.set(key, { shopper, brand: brand ?? "", price, weight });
    else if (weight > existing.weight) existing.weight = weight;
  };

  for (const click of clicks) bump(click.anonymous_user_id, click.product_id, click.brand_slug, num(click.product_price), ESTIMATE_WEIGHTS.click);
  for (const event of events) {
    if (event.event_type === "add_to_cart") bump(event.anonymous_user_id, event.product_id, event.brand_slug, num(event.price), ESTIMATE_WEIGHTS.bag);
  }

  // A checkout click is per shopper + brand: upgrade everything that shopper had from that brand.
  const extraCheckout = new Map<string, number>();
  for (const event of events) {
    if (event.event_type !== "cart_checkout_click" || !event.anonymous_user_id) continue;
    let upgraded = false;
    for (const item of items.values()) {
      if (item.shopper === event.anonymous_user_id && item.brand === (event.brand_slug ?? "")) {
        item.weight = Math.max(item.weight, ESTIMATE_WEIGHTS.checkout);
        upgraded = true;
      }
    }
    if (!upgraded) {
      const subtotal = num((event.metadata as Record<string, unknown> | null)?.subtotal);
      const key = `${event.anonymous_user_id}::${event.brand_slug}`;
      if (subtotal && !extraCheckout.has(key)) extraCheckout.set(key, subtotal);
    }
  }

  let total = 0;
  for (const item of items.values()) total += item.price * item.weight;
  for (const subtotal of extraCheckout.values()) total += subtotal * ESTIMATE_WEIGHTS.checkout;
  return Math.round(total * 100) / 100;
}
