alter table public.customer_requests
  add constraint customer_requests_order_id_fkey
  foreign key (order_id) references public.orders(id) on delete cascade;

create index if not exists customer_requests_order_id_idx on public.customer_requests(order_id);