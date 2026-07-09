"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "name", label: "Name (A–Z)" },
  { value: "newest", label: "Recently added" },
  { value: "products", label: "Most products" },
  { value: "synced", label: "Last synced" },
];

/** Sort dropdown for /admin/brands — navigates via a `sort` query param, preserving whatever else is already there. */
export function SortSelect({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "name") params.delete("sort");
    else params.set("sort", value);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="admin-sort-bar" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, fontSize: 12 }}>
      <label htmlFor="sort">Sort</label>
      <select id="sort" defaultValue={defaultValue} onChange={(event) => onChange(event.target.value)} style={{ height: 34, border: "1px solid rgba(16,16,16,.25)", padding: "0 8px", fontSize: 12, background: "#fff" }}>
        {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}
