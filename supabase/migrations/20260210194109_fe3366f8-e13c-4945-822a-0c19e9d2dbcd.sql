
-- =============================================
-- A) Fix public_order_number to be numeric sequential starting at 100100
-- =============================================

-- Drop the old sequence and create new one starting at 100100
DROP SEQUENCE IF EXISTS public.order_number_seq;
CREATE SEQUENCE public.order_number_seq START WITH 100100 INCREMENT BY 1;

-- Update the trigger function to generate plain numeric order numbers
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  seq_val bigint;
BEGIN
  seq_val := nextval('public.order_number_seq');
  NEW.public_order_number := seq_val::text;
  RETURN NEW;
END;
$function$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS set_order_number ON public.orders;
CREATE TRIGGER set_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  WHEN (NEW.public_order_number = '' OR NEW.public_order_number IS NULL)
  EXECUTE FUNCTION public.generate_order_number();

-- =============================================
-- B) Add new columns to orders table
-- =============================================

-- Confirmation & fulfillment
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_fulfilled boolean NOT NULL DEFAULT false;

-- Risk system
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS risk_score integer NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS risk_level text NOT NULL DEFAULT 'low';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS risk_reasons text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS review_required boolean NOT NULL DEFAULT false;

-- Identity signals
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cookie_id_hash text;

-- Normalization fields
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS raw_city text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS raw_address text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS normalized_city text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS normalized_address text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS normalization_confidence numeric;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS normalization_notes text;

-- =============================================
-- F) Courier export settings table
-- =============================================

CREATE TABLE IF NOT EXISTS public.courier_export_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Default Courier Template',
  is_active boolean NOT NULL DEFAULT true,
  fixed_columns_map jsonb NOT NULL DEFAULT '{
    "D": "",
    "F": "1",
    "J": "არა",
    "L": "არა",
    "M": "არა",
    "N": "არა",
    "P": "ბიგმარტი",
    "Q": "იუმაშევის 11",
    "R": "თბილისი",
    "S": "555555555",
    "T": "ბიგმარტი",
    "U": "სტანდარტული",
    "V": "არა"
  }'::jsonb,
  dynamic_columns_map jsonb NOT NULL DEFAULT '{
    "A": "customer_name",
    "B": "normalized_address",
    "C": "normalized_city",
    "E": "customer_phone",
    "G": "item_quantities",
    "H": "order_id",
    "I": "item_skus",
    "K": "total",
    "O": "notes"
  }'::jsonb,
  file_type text NOT NULL DEFAULT 'xlsx',
  include_headers boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.courier_export_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage courier_export_settings"
  ON public.courier_export_settings
  FOR ALL
  USING (is_active_admin(auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER update_courier_export_settings_updated_at
  BEFORE UPDATE ON public.courier_export_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default template
INSERT INTO public.courier_export_settings (name, is_active) VALUES ('Default Courier Template', true);

-- =============================================
-- Indexes for risk scoring lookups
-- =============================================
CREATE INDEX IF NOT EXISTS idx_orders_cookie_id_hash ON public.orders (cookie_id_hash) WHERE cookie_id_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON public.orders (customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_normalized_address ON public.orders (normalized_address) WHERE normalized_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_ip_address ON public.orders (ip_address) WHERE ip_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_is_confirmed ON public.orders (is_confirmed, is_fulfilled, status);
