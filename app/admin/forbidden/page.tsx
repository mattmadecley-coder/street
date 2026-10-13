import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/admin/ui";
import { PERMISSIONS } from "@/lib/admin-permissions";
import { requireUser } from "@/lib/admin-guard";
import { ROLE_LABELS } from "@/lib/admin-permissions";

export const metadata = { title: "Not allowed" };

const DESCRIPTIONS: Record<string, string> = {
  "catalog.write": "change brands, products or collections",
  "catalog.delete": "delete products or collections",
  "catalog.purge": "permanently delete data",
  "homepage.write": "change the homepage",
  "reports.manage": "build or edit brand reports",
  "reports.send": "send emails to brands",
  "email.write": "build email segments and templates",
  "email.send": "send emails to customers",
  "analytics.write": "change analytics notes and alerts",
  "settings.write": "change settings",
  "team.manage": "manage the team",
  "audit.view": "see the activity log",
  view: "view this page",
};

export default async function ForbiddenPage({ searchParams }: { searchParams: Promise<{ needs?: string }> }) {
  const principal = await requireUser();
  const { needs = "" } = await searchParams;
  const what = (PERMISSIONS as readonly string[]).includes(needs) ? DESCRIPTIONS[needs] : "do that";
  return (
    <div>
      <PageHeader title="Not allowed" />
      <EmptyState title={`Your role (${ROLE_LABELS[principal.role].label}) cannot ${what}.`} action={<Link href="/admin" className="adm-btn" data-variant="secondary">Back to Home</Link>}>
        Ask an owner to change your role if you need this.
      </EmptyState>
    </div>
  );
}
