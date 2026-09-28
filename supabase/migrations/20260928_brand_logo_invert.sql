-- Lets an admin mark a brand's logo as needing a CSS invert filter (for
-- logos whose primary color is white and disappear on Street's light
-- background). Applied at render time in the app, not to the stored image.
alter table public.brands add column if not exists logo_invert boolean not null default false;
