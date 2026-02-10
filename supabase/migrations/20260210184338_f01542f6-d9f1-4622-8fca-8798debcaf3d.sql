
-- ================================================
-- ORDERS TABLE
-- ================================================
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_order_number text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'lovable',
  channel text NOT NULL DEFAULT 'cod',
  status text NOT NULL DEFAULT 'new',
  payment_method text NOT NULL DEFAULT 'COD',
  currency text NOT NULL DEFAULT 'GEL',
  subtotal numeric NOT NULL DEFAULT 0,
  shipping_fee numeric NOT NULL DEFAULT 0,
  discount_total numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text,
  city text NOT NULL DEFAULT '',
  region text NOT NULL DEFAULT '',
  address_line1 text NOT NULL DEFAULT '',
  address_line2 text,
  notes_customer text,
  internal_note text,
  tags text[] NOT NULL DEFAULT '{}',
  assigned_to text,
  is_tbilisi boolean NOT NULL DEFAULT false,
  shopify_order_id text,
  courier_name text,
  tracking_number text,
  tracking_url text,
  courier_status text
);

CREATE INDEX idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_customer_phone ON public.orders(customer_phone);
CREATE INDEX idx_orders_public_order_number ON public.orders(public_order_number);

-- Auto update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-generate public_order_number sequence
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START WITH 1;

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
  seq_val bigint;
  year_str text;
BEGIN
  seq_val := nextval('public.order_number_seq');
  year_str := to_char(now(), 'YYYY');
  NEW.public_order_number := 'LB-' || year_str || '-' || lpad(seq_val::text, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER set_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  WHEN (NEW.public_order_number IS NULL OR NEW.public_order_number = '')
  EXECUTE FUNCTION public.generate_order_number();

-- ================================================
-- ORDER ITEMS TABLE
-- ================================================
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  product_id text NOT NULL DEFAULT '',
  variant_id text,
  sku text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  image_url text NOT NULL DEFAULT '',
  icon_url text,
  tags text[] NOT NULL DEFAULT '{}',
  collection text
);

CREATE INDEX idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX idx_order_items_sku ON public.order_items(sku);

-- ================================================
-- ORDER EVENTS TABLE (audit log)
-- ================================================
CREATE TABLE public.order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL DEFAULT 'system',
  event_type text NOT NULL DEFAULT 'status_change',
  payload jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_order_events_order_id ON public.order_events(order_id);

-- ================================================
-- ADMIN USERS TABLE
-- ================================================
CREATE TABLE public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  email text UNIQUE NOT NULL,
  role text NOT NULL DEFAULT 'operator',
  is_active boolean NOT NULL DEFAULT true
);

-- ================================================
-- RLS POLICIES
-- ================================================

-- Enable RLS on all tables
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Security definer function to check if user is active admin
CREATE OR REPLACE FUNCTION public.is_active_admin(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE email = (SELECT email FROM auth.users WHERE id = user_id)
      AND is_active = true
  );
$$;

-- Orders: only active admins can read/write
CREATE POLICY "Active admins can view orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (public.is_active_admin(auth.uid()));

CREATE POLICY "Active admins can insert orders"
  ON public.orders FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_admin(auth.uid()));

-- Allow anonymous inserts for storefront checkout
CREATE POLICY "Storefront can create orders"
  ON public.orders FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Active admins can update orders"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (public.is_active_admin(auth.uid()));

CREATE POLICY "Active admins can delete orders"
  ON public.orders FOR DELETE
  TO authenticated
  USING (public.is_active_admin(auth.uid()));

-- Order items: same pattern
CREATE POLICY "Active admins can view order_items"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (public.is_active_admin(auth.uid()));

CREATE POLICY "Storefront can create order_items"
  ON public.order_items FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Active admins can insert order_items"
  ON public.order_items FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_admin(auth.uid()));

CREATE POLICY "Active admins can update order_items"
  ON public.order_items FOR UPDATE
  TO authenticated
  USING (public.is_active_admin(auth.uid()));

CREATE POLICY "Active admins can delete order_items"
  ON public.order_items FOR DELETE
  TO authenticated
  USING (public.is_active_admin(auth.uid()));

-- Order events: same pattern
CREATE POLICY "Active admins can view order_events"
  ON public.order_events FOR SELECT
  TO authenticated
  USING (public.is_active_admin(auth.uid()));

CREATE POLICY "Storefront can create order_events"
  ON public.order_events FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Active admins can insert order_events"
  ON public.order_events FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_admin(auth.uid()));

CREATE POLICY "Active admins can update order_events"
  ON public.order_events FOR UPDATE
  TO authenticated
  USING (public.is_active_admin(auth.uid()));

-- Admin users: only active admins can manage
CREATE POLICY "Active admins can view admin_users"
  ON public.admin_users FOR SELECT
  TO authenticated
  USING (public.is_active_admin(auth.uid()));

CREATE POLICY "Active admins can insert admin_users"
  ON public.admin_users FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_admin(auth.uid()));

CREATE POLICY "Active admins can update admin_users"
  ON public.admin_users FOR UPDATE
  TO authenticated
  USING (public.is_active_admin(auth.uid()));

CREATE POLICY "Active admins can delete admin_users"
  ON public.admin_users FOR DELETE
  TO authenticated
  USING (public.is_active_admin(auth.uid()));
