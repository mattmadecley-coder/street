# Street Fit Wars

Fit Wars is integrated into the Street Next.js app.

## Setup

1. Apply `supabase/migrations/20261028_fit_wars.sql` to the existing Street database on the Netcup VPS. Street uses a self-hosted Supabase-compatible stack (Postgres + PostgREST + Storage) on that VPS; this does not require Supabase Cloud or a new hosted service. The migration creates the server-only Fit Wars tables and seeds a fictional `mc` demo campaign with stock demo images.
2. Make sure the existing VPS-backed `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` are available to the app.
3. Configure `RESEND_API_KEY` and a verified `EMAIL_SENDING_DOMAIN` (defaults to `mail.streetdotcom.com`) for leaderboard emails. Email settings under `/admin/email/settings` control the sender and reply-to address.
4. Sign in to `/admin`, open `Fit Wars`, create or edit a campaign, add approved outfit images, create matchups, then publish it.

## URLs

- Demo: `/f/mc`
- Admin: `/admin/fit-wars`
- Preview: `/f/<code>?preview=1` while signed in as a Street administrator

Instagram post URLs are recorded as references only. Street does not scrape Instagram or assume an Instagram URL can be converted to an image. An administrator must upload an approved image or provide a permitted direct image URL before publishing an outfit.

Results requests are stored separately from marketing consent. When the optional marketing checkbox is selected, the visitor is added to Street's existing `email_contacts` subscription flow with a `fit_wars:<code>` tag.
