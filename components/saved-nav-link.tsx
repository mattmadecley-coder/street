"use client";

import Link from "next/link";
import { useSaved } from "@/components/saved-context";

export function SavedNavLink() {
  const { count } = useSaved();
  return <Link href="/saved">Saved{count ? ` (${count})` : ""}</Link>;
}
