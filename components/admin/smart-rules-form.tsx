import styles from "@/app/admin/admin.module.css";
import { SubmitButton } from "@/components/admin/submit-button";
import { STREET_TAXONOMY, categoriesForGroup } from "@/lib/street-taxonomy";
import { describeCriteria } from "@/lib/product-criteria";
import { SMART_ORDERS, DEFAULT_SMART_LIMIT, MAX_SMART_LIMIT, type SmartRules } from "@/lib/smart-collections";
import { saveSmartRulesAction, syncSmartNowAction } from "@/app/admin/collections/actions";

type Props = {
  collectionId: string;
  slug: string;
  rules: SmartRules | undefined;
  brands: Array<{ slug: string; name: string }>;
  available: boolean;
};

export function SmartRulesForm({ collectionId, slug, rules, brands, available }: Props) {
  const criteria = rules?.criteria ?? {};
  const selectedBrands = new Set(criteria.brands ?? []);
  const groups = Object.keys(STREET_TAXONOMY);
  const categories = [...new Set(groups.flatMap((group) => categoriesForGroup(group)))].sort();

  if (!available) {
    return <p className={styles.rowMeta}>Automatic collections switch on after the admin storage migration is applied (see docs/ADMIN.md).</p>;
  }

  return (
    <>
      {rules?.enabled ? (
        <p className={styles.rowMeta}>
          Automatic: {describeCriteria(criteria)}. {rules.lastSyncAt ? `Last updated ${new Date(rules.lastSyncAt).toLocaleString()} with ${rules.lastCount ?? 0} products.` : "Not updated yet."} It refreshes every morning.
        </p>
      ) : (
        <p className={styles.rowMeta}>Off. Switch it on and the products below are filled in from your rules, and kept up to date every morning. Hand-picked products are replaced while it is on.</p>
      )}
      <form action={saveSmartRulesAction} className={styles.form}>
        <input type="hidden" name="id" value={collectionId} />
        <input type="hidden" name="slug" value={slug} />
        <label className={styles.checkboxField}>
          <input type="checkbox" name="enabled" defaultChecked={rules?.enabled ?? false} />
          Fill this collection automatically from rules
        </label>
        <div className={styles.field}>
          <label htmlFor="sr-brands">Brands (any of these; leave empty for all)</label>
          <select id="sr-brands" name="brands" multiple size={6} defaultValue={[...selectedBrands]}>
            {[...brands].sort((a, b) => a.name.localeCompare(b.name)).map((brand) => <option key={brand.slug} value={brand.slug}>{brand.name}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="sr-group">Group</label>
          <select id="sr-group" name="group" defaultValue={criteria.group ?? ""}>
            <option value="">Any</option>
            {groups.map((group) => <option key={group} value={group}>{group}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="sr-category">Category (needs a group)</label>
          <input id="sr-category" name="category" type="text" list="sr-categories" defaultValue={criteria.category ?? ""} placeholder="e.g. Sneakers" />
          <datalist id="sr-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist>
        </div>
        <div className={styles.field}>
          <label htmlFor="sr-type">Type (needs a category)</label>
          <input id="sr-type" name="type" type="text" defaultValue={criteria.type ?? ""} />
        </div>
        <div className={styles.field}>
          <label htmlFor="sr-tags">Tags (comma-separated, products need all of them)</label>
          <input id="sr-tags" name="tags" type="text" defaultValue={(criteria.tags ?? []).join(", ")} />
        </div>
        <div className={styles.field}>
          <label htmlFor="sr-q">Title contains</label>
          <input id="sr-q" name="q" type="text" defaultValue={criteria.q ?? ""} />
        </div>
        <div className={styles.field}>
          <label htmlFor="sr-min">Lowest price ($)</label>
          <input id="sr-min" name="min_price" type="number" min="0" step="0.01" defaultValue={criteria.minPrice ?? ""} />
        </div>
        <div className={styles.field}>
          <label htmlFor="sr-max">Highest price ($)</label>
          <input id="sr-max" name="max_price" type="number" min="0" step="0.01" defaultValue={criteria.maxPrice ?? ""} />
        </div>
        <div className={styles.field}>
          <label htmlFor="sr-stock">Availability</label>
          <select id="sr-stock" name="stock" defaultValue={criteria.stock ?? ""}>
            <option value="">Any</option>
            <option value="in_stock">In stock only</option>
            <option value="sold_out">Sold out only</option>
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="sr-days">Only products added in the last N days</label>
          <input id="sr-days" name="added_within_days" type="number" min="1" max="3650" defaultValue={criteria.addedWithinDays ?? ""} />
        </div>
        <label className={styles.checkboxField}>
          <input type="checkbox" name="on_sale" defaultChecked={criteria.onSale ?? false} />
          Only products marked down
        </label>
        <div className={styles.field}>
          <label htmlFor="sr-order">Order</label>
          <select id="sr-order" name="order" defaultValue={rules?.order ?? "newest"}>
            {SMART_ORDERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="sr-limit">Maximum products (1–{MAX_SMART_LIMIT})</label>
          <input id="sr-limit" name="limit" type="number" min="1" max={MAX_SMART_LIMIT} defaultValue={rules?.limit ?? DEFAULT_SMART_LIMIT} />
        </div>
        <div className={styles.actions}>
          <SubmitButton pendingText="Saving…" className={styles.button}>Save rules{rules?.enabled ? " and update" : ""}</SubmitButton>
        </div>
      </form>
      {rules?.enabled ? (
        <form action={syncSmartNowAction} className="u-mt-14">
          <input type="hidden" name="id" value={collectionId} />
          <input type="hidden" name="slug" value={slug} />
          <SubmitButton pendingText="Updating…" className={styles.buttonSecondary}>Update products now</SubmitButton>
        </form>
      ) : null}
    </>
  );
}
