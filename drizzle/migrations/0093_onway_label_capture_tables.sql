CREATE TABLE public.onway_label_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  tracking text NOT NULL,
  box_index integer NOT NULL DEFAULT 1,
  box_count integer NOT NULL DEFAULT 1,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT onway_label_data_tracking_box_unique UNIQUE (tracking, box_index)
);

CREATE INDEX idx_onway_label_data_order_id ON public.onway_label_data (order_id);

GRANT SELECT ON public.onway_label_data TO authenticated;
GRANT ALL ON public.onway_label_data TO service_role;

ALTER TABLE public.onway_label_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read Onway label data"
  ON public.onway_label_data
  FOR SELECT
  TO authenticated
  USING (public.is_active_admin(auth.uid()));

CREATE TABLE public.onway_label_fetches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  http_status integer,
  order_count integer NOT NULL DEFAULT 0,
  raw text,
  error text
);

CREATE INDEX idx_onway_label_fetches_fetched_at ON public.onway_label_fetches (fetched_at DESC);

GRANT ALL ON public.onway_label_fetches TO service_role;

ALTER TABLE public.onway_label_fetches ENABLE ROW LEVEL SECURITY;