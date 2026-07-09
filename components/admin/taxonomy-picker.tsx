"use client";

import { useState } from "react";
import styles from "@/app/admin/admin.module.css";
import { STREET_TAXONOMY, categoriesForGroup, typesForCategory, detailsForType, FOOTWEAR_ACTIVITIES } from "@/lib/street-taxonomy";

const GROUPS = Object.keys(STREET_TAXONOMY);

/**
 * Cascading group -> category -> type -> detail picker for manually
 * correcting a product's Street taxonomy (see lib/street-taxonomy.ts). Plain
 * <select> elements with `name` attributes so the surrounding server-action
 * form picks up their values on submit — no client-side form handling here.
 */
export function TaxonomyPicker({
  idPrefix,
  initialGroup,
  initialCategory,
  initialType,
  initialDetail,
  initialActivity,
}: {
  idPrefix: string;
  initialGroup?: string;
  initialCategory?: string;
  initialType?: string;
  initialDetail?: string;
  initialActivity?: string;
}) {
  const [group, setGroup] = useState(initialGroup ?? "");
  const [category, setCategory] = useState(initialCategory ?? "");
  const [type, setType] = useState(initialType ?? "");
  const [detail, setDetail] = useState(initialDetail ?? "");
  const [activity, setActivity] = useState(initialActivity ?? "");

  const categoryOptions = group ? categoriesForGroup(group) : [];
  const typeOptions = group && category ? typesForCategory(group, category) : [];
  const detailOptions = group && category && type ? detailsForType(group, category, type) : [];

  return (
    <>
      <div className={styles.field}>
        <label htmlFor={`${idPrefix}-group`}>Group</label>
        <select id={`${idPrefix}-group`} name="street_group" value={group} onChange={(event) => { setGroup(event.target.value); setCategory(""); setType(""); setDetail(""); }}>
          <option value="">— Select —</option>
          {GROUPS.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
      <div className={styles.field}>
        <label htmlFor={`${idPrefix}-category`}>Category</label>
        <select id={`${idPrefix}-category`} name="street_category" value={category} disabled={!group} onChange={(event) => { setCategory(event.target.value); setType(""); setDetail(""); }}>
          <option value="">— Select —</option>
          {categoryOptions.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
      {typeOptions.length ? (
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-type`}>Type</label>
          <select id={`${idPrefix}-type`} name="street_type" value={type} onChange={(event) => { setType(event.target.value); setDetail(""); }}>
            <option value="">— Select —</option>
            {typeOptions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
      ) : <input type="hidden" name="street_type" value="" />}
      {detailOptions.length ? (
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-detail`}>Detail</label>
          <select id={`${idPrefix}-detail`} name="street_detail" value={detail} onChange={(event) => setDetail(event.target.value)}>
            <option value="">— Select —</option>
            {detailOptions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
      ) : <input type="hidden" name="street_detail" value="" />}
      {group === "Footwear" ? (
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-activity`}>Activity</label>
          <select id={`${idPrefix}-activity`} name="street_activity" value={activity} onChange={(event) => setActivity(event.target.value)}>
            <option value="">— Select —</option>
            {FOOTWEAR_ACTIVITIES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
      ) : <input type="hidden" name="street_activity" value="" />}
    </>
  );
}
