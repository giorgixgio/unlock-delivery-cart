
-- Create products table
CREATE TABLE public.products (
  id text PRIMARY KEY,
  title text NOT NULL DEFAULT '',
  handle text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  vendor text NOT NULL DEFAULT '',
  sku text NOT NULL DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  compare_at_price numeric,
  image text NOT NULL DEFAULT '/placeholder.svg',
  images jsonb NOT NULL DEFAULT '[]',
  category text NOT NULL DEFAULT 'uncategorized',
  tags text[] NOT NULL DEFAULT '{}',
  available boolean NOT NULL DEFAULT true,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Anyone can read products"
  ON public.products FOR SELECT USING (true);

-- Admin write
CREATE POLICY "Admins can manage products"
  ON public.products FOR ALL
  USING (is_active_admin(auth.uid()));
