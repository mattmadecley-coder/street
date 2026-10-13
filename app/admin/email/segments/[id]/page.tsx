import { notFound } from "next/navigation";
import styles from "@/app/admin/admin.module.css";
import { Banner, PageHeader } from "@/components/admin/ui";
import { SegmentBuilder } from "@/components/admin/segment-builder";
import { requireUser } from "@/lib/admin-guard";
import { can } from "@/lib/admin-permissions";
import { getSegment } from "@/lib/email-segments";
import { deleteSegmentAction, saveSegmentAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditSegmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const principal = await requireUser();
  const { id } = await params;
  const { saved, error } = await searchParams;
  const segment = await getSegment(id);
  if (!segment) notFound();
  const canWrite = can(principal.role, "email.write");

  return (
    <div>
      <PageHeader title={segment.name} crumbs={[{ label: "Segments", href: "/admin/email/segments" }, { label: segment.name }]} subtitle={segment.description || undefined} />
      {error ? <p className={styles.noticeError} role="alert">{error}</p> : null}
      {saved ? <Banner tone="success">Saved.</Banner> : null}
      {!canWrite ? <Banner tone="info">You have view-only access to segments.</Banner> : null}
      <SegmentBuilder
        id={segment.id}
        initialName={segment.name}
        initialDescription={segment.description}
        initialDefinition={segment.definition}
        saveAction={saveSegmentAction}
        deleteAction={deleteSegmentAction}
        canWrite={canWrite}
      />
    </div>
  );
}
