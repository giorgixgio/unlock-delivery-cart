create table public.telegram_stock_alerts (
  product_id text primary key,
  sku text not null,
  alerted_at timestamptz not null default now()
);
GRANT ALL ON public.telegram_stock_alerts TO service_role;
ALTER TABLE public.telegram_stock_alerts ENABLE ROW LEVEL SECURITY;

create or replace function public.notify_telegram_new_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  secret text;
begin
  if new.merged_into_order_id is not null or new.is_return then return new; end if;
  select value into secret from public.site_settings where key = 'telegram_alert_secret';
  if secret is null then return new; end if;
  perform net.http_post(
    url := 'https://apkephplnoefbuxoyovr.supabase.co/functions/v1/telegram-alerts',
    headers := jsonb_build_object('Content-Type','application/json','x-internal-secret', secret),
    body := jsonb_build_object('type','order_created','order_id', new.id),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;

drop trigger if exists orders_telegram_new_order on public.orders;
create trigger orders_telegram_new_order
after insert on public.orders
for each row execute function public.notify_telegram_new_order();