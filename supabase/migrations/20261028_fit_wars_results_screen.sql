-- Fit Wars results screen copy and marketing consent wording.
-- Street runs this Supabase-compatible database on its own VPS.

alter table public.fit_wars_campaigns
  alter column results_headline set default 'WANT TO SEE WHO HAD THE WORST FIT?',
  alter column results_copy set default 'Enter your email to get the final Fit Wars leaderboard.',
  alter column marketing_label set default 'Allow Street to send you emails';

update public.fit_wars_campaigns
set results_headline = 'WANT TO SEE WHO HAD THE WORST FIT?',
    results_copy = 'Enter your email to get the final Fit Wars leaderboard.',
    marketing_label = 'Allow Street to send you emails',
    updated_at = now()
where code = 'mc'
  and results_headline = 'YOU''VE GOT TASTE. OR DO YOU?'
  and marketing_label = 'Send me fashion finds and updates from Street.';

notify pgrst, 'reload schema';
