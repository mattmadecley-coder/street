// Reads the GM-maintained HQ dashboard snapshot straight from GitHub's
// Contents API -- no app deploy needed to see fresh department state,
// because the GM commits `hq/_shared/dashboard.json` to this repo on its
// own cadence (every department run, roughly every 2 hours) the same way
// it already commits every other `hq/` file. This replaces the old
// hq_* Supabase mirror (DELETE+INSERT sync via the Supabase MCP tool),
// which kept hanging on an unanswered destructive-operation confirmation.
// See hq/product/questions.md ("Assigned by Matthew", 2026-10-24) for the
// full history, and hq/_shared/dashboard-schema.md for the JSON contract.
//
// Needs a read-only GitHub token scoped to just this repo's contents --
// deliberately a different credential from `.env.ops.local`'s `GH_TOKEN`
// (that one has push rights and is ops-only; never reuse it here, and
// never let this one gain write scope).

type DashboardSourceConfig = {
  repo: string;
  branch: string;
  token: string;
  path: string;
};

/** The file GM writes every run. Department state as of its most recent commit. */
const DASHBOARD_PATH = "hq/_shared/dashboard.json";

function getConfig(): DashboardSourceConfig | null {
  const token = process.env.HQ_DASHBOARD_GITHUB_TOKEN;
  if (!token) return null;
  const repo = process.env.HQ_DASHBOARD_GITHUB_REPO ?? "mattmadecley-coder/street";
  // `work` is the branch every department (including the GM) commits hq/
  // changes to every run -- see hq/_shared/company.md. Reading it directly,
  // rather than whatever's on `main`, is what makes this "live": no
  // rebase-onto-main/redeploy round trip sits between a department's run
  // and Matthew seeing it on /admin/hq.
  const branch = process.env.HQ_DASHBOARD_GITHUB_BRANCH ?? "work";
  return { repo, branch, token, path: DASHBOARD_PATH };
}

export function hasHqDashboardSource(): boolean {
  return Boolean(getConfig());
}

// This is a live read off GitHub on page load, not a build-time fetch, but
// hitting the GitHub API on literally every admin request is wasteful and
// risks rate limits. A short revalidate window keeps the office page close
// to real-time (departments run hours apart, not seconds) without that cost.
const REVALIDATE_SECONDS = 60;

export class HqDashboardFetchError extends Error {}

/**
 * Returns the parsed `dashboard.json` contents, or `null` if the source
 * isn't configured yet (no token) or the file doesn't exist yet (GM hasn't
 * shipped its first write under the new scheme). Both are "not available
 * yet" to the caller, not errors -- only an actual GitHub API failure
 * (bad token, rate limit, network) throws.
 */
export async function fetchHqDashboardRaw(): Promise<unknown | null> {
  const config = getConfig();
  if (!config) return null;

  const url = `https://api.github.com/repos/${config.repo}/contents/${encodeURIComponent(config.path)}?ref=${encodeURIComponent(config.branch)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.token}`,
        // The raw media type hands back the file's bytes directly instead
        // of a JSON wrapper with base64 `content` -- one less decode step.
        Accept: "application/vnd.github.raw+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      next: { revalidate: REVALIDATE_SECONDS },
    });
  } catch (error) {
    throw new HqDashboardFetchError(`Could not reach GitHub to read ${config.path}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (response.status === 404) return null;
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new HqDashboardFetchError(`GitHub returned ${response.status} fetching ${config.path}${body ? ` -- ${body.slice(0, 300)}` : ""}`);
  }

  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new HqDashboardFetchError(`${config.path} on ${config.branch} is not valid JSON`);
  }
}
