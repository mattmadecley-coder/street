import { notFound } from "next/navigation";
import { Banner, PageHeader } from "@/components/admin/ui";
import { EmailEditor } from "@/components/admin/email-editor";
import { requireUser } from "@/lib/admin-guard";
import { can } from "@/lib/admin-permissions";
import { getAllBrands } from "@/lib/catalog-store";
import { getTemplate } from "@/lib/email-templates";
import { siteUrl } from "@/lib/email-products";

export const dynamic = "force-dynamic";

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const principal = await requireUser();
  const { id } = await params;
  const template = await getTemplate(id);
  if (!template) notFound();
  const brands = await getAllBrands();
  const canWrite = can(principal.role, "email.write");

  return (
    <div>
      <PageHeader title={template.name} crumbs={[{ label: "Templates", href: "/admin/email/templates" }, { label: template.name }]} subtitle="Add blocks on the left, edit the selected block on the right. Changes are saved when you press Save." />
      {template.archived_at ? <Banner tone="info">This template is archived.</Banner> : null}
      <EmailEditor
        id={template.id}
        initial={{ name: template.name, subject: template.subject, preheader: template.preheader, design: template.design, blocks: template.blocks }}
        brands={brands.map((brand) => ({ slug: brand.slug, name: brand.name }))}
        siteUrl={siteUrl()}
        canWrite={canWrite}
      />
    </div>
  );
}
