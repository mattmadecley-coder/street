"use client";

import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/components/cart-context";

export default function CartPage() {
  const { items, subtotal, setQuantity, removeItem, clear } = useCart();

  return (
    <main className="cart-page shell">
      <div className="cart-head"><div><p className="eyebrow">Saved on Street</p><h1>Your cart</h1></div><Link href="/catalog" className="link-small">Keep shopping</Link></div>
      {!items.length ? (
        <div className="empty"><h2>Your cart is empty.</h2><p>Save products here while you browse across brands.</p><Link href="/catalog" className="cta cart-empty-cta"><span>Shop all</span><span>→</span></Link></div>
      ) : (
        <div className="cart-layout">
          <section className="cart-items">
            {items.map((item) => (
              <article className="cart-item" key={item.key}>
                <Link href={`/products/${item.slug}`} className="cart-image">{item.image ? <Image src={item.image} alt={item.title} fill sizes="140px" style={{ objectFit: "contain" }} /> : null}</Link>
                <div className="cart-copy"><p className="brand">{item.brandName}</p><h2><Link href={`/products/${item.slug}`}>{item.title}</Link></h2>{item.variantLabel ? <p className="cart-variant">{item.variantLabel}</p> : null}<p>${item.price.toFixed(2)}</p><button type="button" className="text-button" onClick={() => removeItem(item.key)}>Remove</button></div>
                <div className="cart-quantity"><button type="button" onClick={() => setQuantity(item.key, item.quantity - 1)} aria-label="Decrease quantity">−</button><span>{item.quantity}</span><button type="button" onClick={() => setQuantity(item.key, item.quantity + 1)} aria-label="Increase quantity">+</button></div>
                <a className="cart-buy" href={`/api/out?to=${encodeURIComponent(item.sourceUrl)}&brand=${encodeURIComponent(item.brandSlug)}&product=${encodeURIComponent(item.slug)}`} target="_blank" rel="noreferrer">Buy now ↗</a>
              </article>
            ))}
          </section>
          <aside className="cart-summary"><p className="eyebrow">Cart summary</p><div><span>Estimated subtotal</span><strong>${subtotal.toFixed(2)}</strong></div><p>Street does not process checkout yet. Each item is purchased from its brand, so shipping and payment are handled separately.</p><button type="button" className="text-button" onClick={clear}>Clear cart</button></aside>
        </div>
      )}
    </main>
  );
}
