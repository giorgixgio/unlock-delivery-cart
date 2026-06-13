
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS address_status text NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS address_added_at timestamptz,
  ADD COLUMN IF NOT EXISTS skipped_address boolean NOT NULL DEFAULT false;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_address_status_chk;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_address_status_chk
  CHECK (address_status IN ('completed','partial','missing'));

CREATE INDEX IF NOT EXISTS orders_address_status_idx ON public.orders(address_status);
