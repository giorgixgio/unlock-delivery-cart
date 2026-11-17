CREATE TABLE public.scratch_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  sku text NOT NULL DEFAULT 'G888-T4656-0012_4',
  promo text NOT NULL DEFAULT 'scratch_0012_4',
  landing_slug text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','ordered','called','no_answer','declined')),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  is_test boolean NOT NULL DEFAULT false,
  note text
);
CREATE INDEX scratch_leads_phone_idx ON public.scratch_leads (phone, created_at DESC);
CREATE INDEX scratch_leads_status_idx ON public.scratch_leads (status, created_at DESC);

GRANT INSERT ON public.scratch_leads TO anon;
GRANT SELECT, INSERT, UPDATE ON public.scratch_leads TO authenticated;
GRANT ALL ON public.scratch_leads TO service_role;
ALTER TABLE public.scratch_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can add new scratch leads" ON public.scratch_leads FOR INSERT TO anon
  WITH CHECK (status = 'new' AND order_id IS NULL AND note IS NULL AND phone ~ '^5[0-9]{8}$');
CREATE POLICY "Staff read scratch leads" ON public.scratch_leads FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff update scratch leads" ON public.scratch_leads FOR UPDATE TO authenticated USING (public.is_active_staff(auth.uid())) WITH CHECK (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff add scratch leads" ON public.scratch_leads FOR INSERT TO authenticated WITH CHECK (public.is_active_staff(auth.uid()));

-- Deduped insert used by the landing popup (mirrors src/lib/scratchLeads.ts shouldInsertScratchLead).
CREATE OR REPLACE FUNCTION public.scratch_lead_submit(p_phone text, p_sku text, p_landing_slug text, p_is_test boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_phone text := right(regexp_replace(coalesce(p_phone,''), '\D', '', 'g'), 9); v_id uuid;
BEGIN
  IF v_phone !~ '^5[0-9]{8}$' THEN RAISE EXCEPTION 'invalid phone'; END IF;
  IF EXISTS (SELECT 1 FROM public.scratch_leads WHERE phone = v_phone AND created_at > now() - interval '24 hours')
     OR EXISTS (SELECT 1 FROM public.orders WHERE phone_last9 = v_phone AND created_at > now() - interval '24 hours') THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.scratch_leads (phone, sku, landing_slug, is_test)
  VALUES (v_phone, coalesce(nullif(p_sku,''), 'G888-T4656-0012_4'), left(p_landing_slug, 300), coalesce(p_is_test, false) OR v_phone = '550501194')
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.scratch_lead_submit(text,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scratch_lead_submit(text,text,text,boolean) TO anon, authenticated, service_role;

-- Link a specific lead to a fresh order (localStorage path).
CREATE OR REPLACE FUNCTION public.scratch_lead_link(p_lead_id uuid, p_order_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.scratch_leads l SET status = 'ordered', order_id = p_order_id, updated_at = now()
  WHERE l.id = p_lead_id AND l.order_id IS NULL
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = p_order_id AND o.created_at > now() - interval '15 minutes');
$$;
REVOKE ALL ON FUNCTION public.scratch_lead_link(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scratch_lead_link(uuid,uuid) TO anon, authenticated, service_role;

-- Phone fallback: any new order from the same phone closes open leads (last 30 days).
CREATE OR REPLACE FUNCTION public.scratch_leads_link_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.scratch_leads SET status = 'ordered', order_id = NEW.id, updated_at = now()
  WHERE order_id IS NULL AND status IN ('new','called','no_answer')
    AND phone = right(regexp_replace(coalesce(NEW.customer_phone,''), '\D', '', 'g'), 9)
    AND created_at > now() - interval '30 days';
  RETURN NEW;
END $$;
CREATE TRIGGER scratch_leads_link_order AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.scratch_leads_link_order();