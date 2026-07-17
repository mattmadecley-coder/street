create or replace function public.refresh_summaries_after_catalog_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'success' and old.status is distinct from 'success' then
    perform public.refresh_brand_product_count(new.brand_id);
    perform public.refresh_catalog_category_summaries();
  end if;
  return new;
end;
$$;

drop trigger if exists catalog_sync_refresh_summaries on public.catalog_sync_runs;
create trigger catalog_sync_refresh_summaries
after update of status on public.catalog_sync_runs
for each row
when (new.status = 'success')
execute function public.refresh_summaries_after_catalog_sync();
