import Link from "next/link";
import styles from "@/app/admin/admin.module.css";
import { Banner, PageHeader } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/submit-button";
import { requireUser } from "@/lib/admin-guard";
import { can } from "@/lib/admin-permissions";
import { TEMPLATE_PRESETS } from "@/lib/email-blocks";
import { listTemplates } from "@/lib/email-templates";
import { archiveTemplateAction, createTemplateAction, duplicateTemplateAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Email templates" };

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const principal = await requireUser();
  const canWrite = can(principal.role, "email.write");
  const { error } = await searchParams;
  const { templates, available } = await listTemplates();

  return (
    <div>
      <PageHeader title="Templates" subtitle="Reusable email layouts. Build one with blocks (text, images, buttons, products), then use it in campaigns and sequences." />
      {error ? <p className={styles.noticeError} role="alert">{error}</p> : null}
      {!available ? <Banner tone="warn">Templates switch on after the email platform migration is applied (see docs/ADMIN.md).</Banner> : null}

      {templates.length ? (
        <section className={styles.section}>
          <table className={styles.table}>
            <thead><tr><th scope="col">Template</th><th scope="col">Subject</th><th scope="col">Blocks</th><th scope="col">Last edited</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.id}>
                  <th scope="row"><Link href={`/admin/email/templates/${template.id}`}>{template.name}</Link></th>
                  <td>{template.subject || <span className={styles.rowMeta}>No subject yet</span>}</td>
                  <td>{template.blocks.length}</td>
                  <td>{new Date(template.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                  <td>
                    {canWrite ? (
                      <span className="u-row" style={{ gap: 6 }}>
                        <form action={duplicateTemplateAction}><input type="hidden" name="id" value={template.id} /><SubmitButton pendingText="…" className={styles.buttonSecondary}>Duplicate</SubmitButton></form>
                        <form action={archiveTemplateAction}><input type="hidden" name="id" value={template.id} /><input type="hidden" name="archived" value="1" /><SubmitButton pendingText="…" className={styles.buttonSecondary}>Archive</SubmitButton></form>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : available ? <p className={styles.rowMeta}>No templates yet. Start from one below.</p> : null}

      {canWrite && available ? (
        <section className={styles.section}>
          <div className={styles.sectionHead}><h2>Start a new template</h2></div>
          <div className="u-cards-300">
            {TEMPLATE_PRESETS.map((preset) => (
              <form key={preset.key} action={createTemplateAction} className="adm-card">
                <input type="hidden" name="preset" value={preset.key} />
                <div className="adm-card-head"><h3>{preset.name}</h3></div>
                <p className={styles.rowMeta}>{preset.description}</p>
                <div className="u-mt-14"><SubmitButton pendingText="Creating…" className={styles.button}>Use this</SubmitButton></div>
              </form>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
