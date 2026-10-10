-- Which classifier pass produced a product's current classification.
--   1 = first (text) classifier was confident
--   2 = first classifier was unsure, 2nd pass (3 candidates, pick best) decided
-- classification_first_guess keeps pass 1's answer when pass 2 ran.
alter table public.products
  add column if not exists classification_pass smallint not null default 1,
  add column if not exists classification_first_guess jsonb;

notify pgrst, 'reload schema';
