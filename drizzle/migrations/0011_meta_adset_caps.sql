create table public.meta_adset_caps (
  adset_id text primary key,
  adset_name text not null,
  sku text not null,
  cap_qty integer not null,
  count_from timestamptz not null,
  is_enabled boolean not null default true,
  paused_at timestamptz,
  last_qty integer,
  last_checked_at timestamptz,
  last_error text
);
grant select, insert, update, delete on public.meta_adset_caps to authenticated;
grant all on public.meta_adset_caps to service_role;
alter table public.meta_adset_caps enable row level security;
create policy "admins manage adset caps" on public.meta_adset_caps for all to authenticated
  using (public.is_active_admin(auth.uid())) with check (public.is_active_admin(auth.uid()));
insert into public.meta_adset_caps (adset_id, adset_name, sku, cap_qty, count_from) values
 ('120252766061160153','0019_შლანგი','G888-T4656-0019',70,'2026-09-30T20:00:00Z'),
 ('120252551139680153','kamera – Copy','002',150,'2026-09-30T20:00:00Z'),
 ('120252629786560153','0012_woodworking','G888-T4656-0012_4',30,'2026-09-30T20:00:00Z'),
 ('120252766195800153','0018_tavaki','G888-T4656-0018',24,'2026-09-30T20:00:00Z'),
 ('120252629539110153','0010_vacuum','G888-T4656-0010',40,'2026-09-30T20:00:00Z');
create extension if not exists pg_cron;
create extension if not exists pg_net;