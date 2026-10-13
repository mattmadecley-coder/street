import Link from "next/link";
import styles from "@/app/admin/admin.module.css";
import { LogoInvertPreview } from "@/components/admin/logo-invert-preview";
import { getBrandBySlug } from "@/lib/catalog-store";
import { startBrandOnboarding, runLogoFinder, approveLogo, saveManualLogo, skipLogo, runImport } from "./actions";
import { requireUser } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

type PageParams = {
  step?: string;
  slug?: string;
  error?: string;
  candidate?: string;
  source?: string;
  notfound?: string;
};

function StepIndicator({ step }: { step: "url" | "logo" | "import" }) {
  const steps: Array<{ key: typeof step; label: string }> = [
    { key: "url", label: "1. Store URL" },
    { key: "logo", label: "2. Logo" },
    { key: "import", label: "3. Import" },
  ];
  const activeIndex = steps.findIndex((item) => item.key === step);
  return (
    <p className={styles.stepper}>
      {steps.map((item, index) => (
        <span key={item.key} data-state={index === activeIndex ? "current" : index < activeIndex ? "done" : "todo"}>{item.label}</span>
      ))}
    </p>
  );
}

export default async function AddBrandPage({ searchParams }: { searchParams: Promise<PageParams> }) {
  await requireUser();
  const params = await searchParams;
  const step = params.step === "logo" || params.step === "import" ? params.step : "url";

  return (
    <div>
      <h1 className={styles.title}>Add a new brand</h1>
      <p className={styles.subtitle}><Link href="/admin/brands" className="link-small">← Back to brands</Link></p>
      <StepIndicator step={step} />

      {step === "url" ? (
        <>
          {params.error ? <p className={styles.noticeError}>{params.error}</p> : null}
          <form action={startBrandOnboarding} className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="store_url">Store URL</label>
              <input id="store_url" name="store_url" type="text" placeholder="https://newbrand.com" required autoFocus />
            </div>
            <div className={styles.field}>
              <label htmlFor="name">Brand name (optional — guessed from the URL if left blank)</label>
              <input id="name" name="name" type="text" placeholder="New Brand" />
            </div>
            <button type="submit" className={styles.button}>Continue</button>
          </form>
        </>
      ) : null}

      {step === "logo" && params.slug ? (
        <LogoStep slug={params.slug} candidate={params.candidate} source={params.source} notfound={params.notfound} />
      ) : null}

      {step === "import" && params.slug ? (
        <ImportStep slug={params.slug} />
      ) : null}
    </div>
  );
}

async function LogoStep({ slug, candidate, source, notfound }: { slug: string; candidate?: string; source?: string; notfound?: string }) {
  const brand = await getBrandBySlug(slug);
  if (!brand) return <p className={styles.noticeError}>Couldn&rsquo;t find that brand draft.</p>;

  return (
    <div>
      <p className="u-mb-16"><strong>{brand.name}</strong> — {brand.storeUrl}</p>

      {!candidate && !notfound ? (
        <form action={runLogoFinder} className={`${styles.form} u-mb-24`}>
          <input type="hidden" name="slug" value={slug} />
          <button type="submit" className={styles.button}>Find logo automatically</button>
        </form>
      ) : null}

      {notfound ? <p className={styles.notice}>Couldn&rsquo;t confidently find a logo on that site. Paste one below, or upload it.</p> : null}

      {candidate ? (
        <div className="u-mb-24">
          <p className={`${styles.rowMeta} u-mb-8`}>Found this {source === "ai" ? "(AI pick from the page's images)" : "(from the site header)"}:</p>
          <img src={candidate} alt="Logo candidate" className={styles.logoCandidate} />
          <div className={styles.actions}>
            <form action={approveLogo}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="candidate" value={candidate} />
              <LogoInvertPreview initialSrc={candidate} />
              <button type="submit" className={styles.button}>Use this logo</button>
            </form>
            <form action={runLogoFinder}>
              <input type="hidden" name="slug" value={slug} />
              <button type="submit" className={styles.buttonSecondary}>Try again</button>
            </form>
          </div>
        </div>
      ) : null}

      <p className={styles.eyebrow}>Or set it manually</p>
      <form action={saveManualLogo} className={`${styles.form} u-mb-16`}>
        <input type="hidden" name="slug" value={slug} />
        <div className={styles.field}>
          <label htmlFor="logo_file">Upload a logo</label>
          <input id="logo_file" name="logo_file" type="file" accept="image/*" />
        </div>
        <div className={styles.field}>
          <label htmlFor="logo_url">Or paste a logo URL</label>
          <input id="logo_url" name="logo_url" type="text" placeholder="https://..." />
        </div>
        <LogoInvertPreview watchUrlInputId="logo_url" watchFileInputId="logo_file" />
        <button type="submit" className={styles.button}>Save and continue</button>
      </form>

      <form action={skipLogo}>
        <input type="hidden" name="slug" value={slug} />
        <button type="submit" className={styles.buttonSecondary}>Skip for now</button>
      </form>
    </div>
  );
}

async function ImportStep({ slug }: { slug: string }) {
  const brand = await getBrandBySlug(slug);
  if (!brand) return <p className={styles.noticeError}>Couldn&rsquo;t find that brand draft.</p>;

  return (
    <div>
      <p className="u-mb-16"><strong>{brand.name}</strong> — {brand.storeUrl}</p>
      <p className={`${styles.rowMeta} u-mb-16`}>
        This pulls in every product — images, prices, sizes, stock status — then classifies each one into a category in the background. You&rsquo;ll land on the Brands page and see {brand.name} at the top under &ldquo;Recently added&rdquo; with a live progress status.
      </p>
      <form action={runImport} className={styles.form}>
        <input type="hidden" name="slug" value={slug} />
        <button type="submit" className={styles.button}>Import products</button>
      </form>
    </div>
  );
}
