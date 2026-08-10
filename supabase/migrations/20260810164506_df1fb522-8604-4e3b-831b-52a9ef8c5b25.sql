-- Fields needed to regenerate an exact courier shipping label locally,
-- without recomputing anything that could drift from what was actually
-- uploaded/printed originally.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS courier_label_text text,      -- e.g. "[S-0034] 86 - 1" (tag + sku - qty), captured at export time
  ADD COLUMN IF NOT EXISTS courier_zone_id integer,       -- looked up from courier_zone_codes at export/import time
  ADD COLUMN IF NOT EXISTS courier_label_date date;       -- date the label was generated (top-left, before the zone number)

COMMENT ON COLUMN public.orders.courier_label_text IS
  'Exact bottom-line text printed on the courier label (tag + SKU/qty), captured at CSV export time so reprints never drift from what was actually uploaded.';

COMMENT ON COLUMN public.orders.courier_zone_id IS
  'Courier zone/route number for this delivery locality, looked up from courier_zone_codes.';

COMMENT ON COLUMN public.orders.courier_label_date IS
  'Date the courier shipping label was generated, used for top-left date block on reprints.';