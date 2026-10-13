import styles from "@/app/admin/admin.module.css";
import { PageHeader } from "@/components/admin/ui";
import { SegmentBuilder } from "@/components/admin/segment-builder";
import { requirePermission } from "@/lib/admin-guard";
import { EMPTY_DEFINITION, SEGMENT_PRESETS } from "@/lib/email-segments-core";
import { saveSegmentAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "New segment" };

export default async function NewSegmentPage({ searchParams }: { searchParams: Promise<{ preset?: string; error?: string }> }) {
  await requirePermission("email.write");
  const { preset: presetKey, error } = await searchParams;
  const preset = SEGMENT_PRESETS.find((entry) => entry.key === presetKey);

  return (
    <div>
      <PageHeader title="New segment" crumbs={[{ label: "Segments", href: "/admin/email/segments" }, { label: "New" }]} subtitle="Pick the rules, watch the audience size update, then save." />
      {error ? <p className={styles.noticeError} role="alert">{error}</p> : null}
      <SegmentBuilder
        initialName={preset?.name ?? ""}
        initialDescription={preset?.description ?? ""}
        initialDefinition={preset?.definition ?? EMPTY_DEFINITION}
        saveAction={saveSegmentAction}
        canWrite
      />
    </div>
  );
}
