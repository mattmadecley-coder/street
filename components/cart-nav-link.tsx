"use client";

import Link from "next/link";
import { useCart } from "@/components/cart-context";

export function CartNavLink() {
  const { count } = useCart();
  return <Link href="/cart">Cart{count ? ` (${count})` : ""}</Link>;
}
