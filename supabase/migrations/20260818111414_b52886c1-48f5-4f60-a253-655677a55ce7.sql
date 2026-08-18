CREATE TABLE public.courier_label_actions (
  id uuid primary key default gen_random_uuid(),
  group_key text not null,
  title text not null,
  kind text not null check (kind in ('pdf','tags','finish')),
  actor text,
  created_at timestamptz not null default now()
);
CREATE INDEX idx_courier_label_actions_created_at ON public.courier_label_actions (created_at desc);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courier_label_actions TO authenticated;
GRANT ALL ON public.courier_label_actions TO service_role;
ALTER TABLE public.courier_label_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage courier label actions" ON public.courier_label_actions FOR ALL TO authenticated USING (public.is_active_staff(auth.uid()) OR public.is_active_admin(auth.uid())) WITH CHECK (public.is_active_staff(auth.uid()) OR public.is_active_admin(auth.uid()));
ALTER PUBLICATION supabase_realtime ADD TABLE public.courier_label_actions;
ALTER TABLE public.courier_label_actions REPLICA IDENTITY FULL;