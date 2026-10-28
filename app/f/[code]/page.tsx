import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPrincipal } from "@/lib/admin-guard";
import { getCampaignExperience } from "@/lib/fit-wars";
import FitWarsClient from "@/app/f/[code]/fit-wars-client";
import styles from "./fit-wars.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const experience = await getCampaignExperience(code, false).catch(() => null);
  return {
    title: experience ? `${experience.campaign.label || experience.campaign.school_name} · Fit Wars` : "Street Fit Wars",
    description: experience?.campaign.headline ?? "Vote on the best fit in your school.",
    robots: { index: false, follow: false },
  };
}

export default async function FitWarsPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { code } = await params;
  const preview = (await searchParams).preview === "1";
  // Keep the seeded demo copy viewable in the in-app browser, which does not
  // share the admin browser session. Preview mode is still read-only, and all
  // other campaigns remain protected behind the admin session.
  const publicDemoPreview = preview && code.toLowerCase() === "mc";
  if (preview && !publicDemoPreview && !(await getPrincipal())) notFound();
  const experience = await getCampaignExperience(code, preview).catch(() => null);
  if (!experience) notFound();
  return (
    <main className={styles.page} data-fit-wars>
      <FitWarsClient experience={experience} preview={preview} />
    </main>
  );
}
