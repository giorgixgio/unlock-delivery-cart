CREATE TABLE public.refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.customer_requests(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  phone text,
  amount numeric,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','submitted','refunded')),
  full_name text,
  iban text,
  sms_status text,
  sms_error text,
  sent_by text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  submitted_at timestamptz,
  refunded_at timestamptz,
  refunded_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX refund_requests_one_per_ticket ON public.refund_requests(request_id);
GRANT SELECT, UPDATE ON public.refund_requests TO authenticated;
GRANT ALL ON public.refund_requests TO service_role;
ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read refund requests" ON public.refund_requests FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Admins update refund requests" ON public.refund_requests FOR UPDATE TO authenticated USING (public.is_active_admin(auth.uid())) WITH CHECK (public.is_active_admin(auth.uid()));