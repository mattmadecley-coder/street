# GA4 + Search Console check — reusable recipe

Verified working end to end on 2026-10-24 (twice). Use this instead of
re-deriving the service-account auth flow from scratch each run.

## Requirements

- `.env.ops.local` has `GOOGLE_APPLICATION_CREDENTIALS` (path to the
  service-account JSON key, lives under `street-secrets/` inside
  `street-work`, gitignored) and `GA4_PROPERTY_ID` (376575603, not a
  secret).
- No new npm dependency needed — Node's built-in `fetch` and
  `node:crypto`/`node:fs` are enough (RS256-sign a JWT, exchange it for
  an OAuth token, call the two APIs directly).

## How to run it

Don't commit a script into the repo for this — write it to a temp file
outside git tracking (e.g. repo root, untracked), run it, delete it when
done. Paste this as `scratch-gsc-ga4-check.mjs`:

```js
import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const key = JSON.parse(readFileSync(keyPath, "utf8"));

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(scopes) {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: key.client_email,
    scope: scopes.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = signer.sign(key.private_key).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

const ga4Token = await getAccessToken(["https://www.googleapis.com/auth/analytics.readonly"]);
const propertyId = process.env.GA4_PROPERTY_ID;
const ga4Res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
  method: "POST",
  headers: { Authorization: `Bearer ${ga4Token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    dateRanges: [{ startDate: "yesterday", endDate: "yesterday" }],
    metrics: [{ name: "activeUsers" }, { name: "sessions" }],
  }),
});
console.log("GA4 runReport status:", ga4Res.status);
console.log(JSON.stringify(await ga4Res.json(), null, 2));

const gscToken = await getAccessToken(["https://www.googleapis.com/auth/webmasters.readonly"]);
const end = new Date();
end.setDate(end.getDate() - 3); // GSC lags ~3 days
const start = new Date(end);
start.setDate(start.getDate() - 7);
const fmt = (d) => d.toISOString().slice(0, 10);
const gscRes = await fetch(
  "https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Astreetdotcom.com/searchAnalytics/query",
  {
    method: "POST",
    headers: { Authorization: `Bearer ${gscToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      startDate: fmt(start),
      endDate: fmt(end),
      dimensions: ["date"],
    }),
  }
);
console.log("GSC searchAnalytics.query status:", gscRes.status);
console.log(JSON.stringify(await gscRes.json(), null, 2));
```

Run it (PowerShell path with backslashes doesn't survive bash `source`
on `.env.ops.local` — export the two vars explicitly instead):

```bash
export GOOGLE_APPLICATION_CREDENTIALS='C:\Users\mattm\Documents\street-work\street-secrets\<key-file>.json'
export GA4_PROPERTY_ID=376575603
node scratch-gsc-ga4-check.mjs
```

Delete the scratch file when done. Never commit it or paste the key
file's contents into any `hq/` file.

## What to look for each run

- GA4 `activeUsers`/`sessions` for "yesterday" vs. `analytics_daily`'s
  visitor count for the same day — expect them close but not identical
  (different methodologies), not a discrepancy to chase.
- GSC `searchAnalytics.query`, dimension `date`, last ~10 days (query
  `startDate`/`endDate` with a 3-day lag built in): watch for a cliff in
  clicks/impressions or a jump in average `position` — that's the signal
  worth escalating, not day-to-day wobble.

## Run history (impressions/clicks/position, for trend context)

- 2026-10-24 run: impressions climbing 341 (10-14) → 671 (10-21),
  clicks bouncing 6-20/day, position holding in the 8-11 range. Nothing
  that looks like a manual action or ranking cliff.
