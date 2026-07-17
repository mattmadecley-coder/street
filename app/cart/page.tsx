"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { useCart, type CartItem } from "@/components/cart-context";

type BrandGroup = { brandName: string; brandSlug: string; items: CartItem[]; subtotal: number; checkoutUrl: string; transfersCart: boolean };

function brandCheckout(items: CartItem[]) {
  const origin = (() => { try { return new URL(items[0].sourceUrl).origin; } catch { return items[0].sourceUrl; } })();
  const variants = items.map((item) => ({ id: item.variantId?.match(/\d+$/)?.[0], quantity: item.quantity }));
  const transfersCart = variants.every((variant) => Boolean(variant.id));
  return { checkoutUrl: transfersCart ? `${origin}/cart/${variants.map((variant) => `${variant.id}:${variant.quantity}`).join(",")}` : origin, transfersCart };
}

export default function CartPage() {
  const { items, subtotal, setQuantity, removeItem, clear } = useCart();
  const groups = useMemo<BrandGroup[]>(() => {
    const grouped = new Map<string, CartItem[]>();
    for (const item of items) grouped.set(item.brandSlug, [...(grouped.get(item.brandSlug) ?? []), item]);
    return [...grouped.entries()].map(([brandSlug, brandItems]) => {
      const checkout = brandCheckout(brandItems);
      return { brandSlug, brandName: brandItems[0].brandName, items: brandItems, subtotal: brandItems.reduce((sum, item) => sum + item.price * item.quantity, 0), ...checkout };
    });
  }, [items]);

  return (
    <main className="cart-page shell">
      <div className="cart-head"><div><p className="eyebrow">Saved on Street</p><h1>Your cart</h1></div><Link href="/catalog" className="link-small">Keep shopping</Link></div>
      {!items.length ? (
        <div className="empty"><h2>Your cart is empty.</h2><p>Save products here while you browse across brands.</p><Link href="/catalog" className="cta cart-empty-cta"><span>Shop all</span><span>→</span></Link></div>
      ) : (
        <div className="cart-layout">
          <section className="cart-items">
            {groups.map((group) => (
              <section className="cart-brand-group" key={group.brandSlug}>
                <div className="cart-brand-head"><Link href={`/brands/${group.brandSlug}`}>{group.brandName}</Link><span>${group.subtotal.toFixed(2)}</span></div>
                {group.items.map((item) => (
                  <article className="cart-item" key={item.key}>
                    <Link href={`/products/${item.slug}`} className="cart-image">{item.image ? <Image src={item.image} alt={item.title} fill sizes="140px" style={{ objectFit: "contain" }} /> : null}</Link>
                    <div className="cart-copy"><p className="brand"><Link href={`/brands/${item.brandSlug}`}>{item.brandName}</Link></p><h2><Link href={`/products/${item.slug}`}>{item.title}</Link></h2>{item.variantLabel ? <p className="cart-variant">{item.variantLabel}</p> : null}<p>${item.price.toFixed(2)}</p><button type="button" className="text-button" onClick={() => removeItem(item.key)}>Remove</button></div>
                    <div className="cart-quantity"><button type="button" onClick={() => setQuantity(item.key, item.quantity - 1)} aria-label="Decrease quantity">−</button><span>{item.quantity}</span><button type="button" onClick={() => setQuantity(item.key, item.quantity + 1)} aria-label="Increase quantity">+</button></div>
                    <a className="cart-buy" href={`/api/out?to=${encodeURIComponent(item.sourceUrl)}&brand=${encodeURIComponent(item.brandSlug)}&product=${encodeURIComponent(item.slug)}`} target="_blank" rel="noreferrer">Buy now ↗</a>
                  </article>
                ))}
              </section>
            ))}
          </section>
          <aside className="cart-summary"><p className="eyebrow">Cart summary</p><div><span>Estimated subtotal</span><strong>${subtotal.toFixed(2)}</strong></div><p>Street does not process checkout yet. Each brand handles its own payment, shipping, and returns.</p><div className="brand-checkouts">{groups.map((group) => <a key={group.brandSlug} className="brand-checkout" href={group.checkoutUrl} target="_blank" rel="noreferrer"><span><strong>Checkout on {group.brandName}</strong><small>{group.transfersCart ? `${group.items.length} item${group.items.length === 1 ? "" : "s"} · cart will transfer` : "Open brand website"}</small></span><span>${group.subtotal.toFixed(2)} ↗</span></a>)}</div><button type="button" className="text-button" onClick={clear}>Clear cart</button></aside>
        </div>
      )}
    </main>
  );
}
