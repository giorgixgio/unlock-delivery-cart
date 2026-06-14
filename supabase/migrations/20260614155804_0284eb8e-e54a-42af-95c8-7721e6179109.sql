CREATE TABLE public.operator_order_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  operator text NOT NULL,
  session_started_at timestamptz NOT NULL DEFAULT now(),
  session_ended_at timestamptz,
  raw_duration_seconds integer,
  capped_duration_seconds integer,
  active_duration_seconds integer,
  was_abandoned boolean NOT NULL DEFAULT false,
  had_meaningful_action boolean NOT NULL DEFAULT false,
  end_reason text,
  outcome text,
  actions_count integer NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX operator_order_sessions_started_idx
  ON public.operator_order_sessions(session_started_at DESC);
CREATE INDEX operator_order_sessions_operator_started_idx
  ON public.operator_order_sessions(operator, session_started_at DESC);
CREATE INDEX operator_order_sessions_order_idx
  ON public.operator_order_sessions(order_id);

GRANT SELECT, INSERT, UPDATE ON public.operator_order_sessions TO authenticated;
GRANT ALL ON public.operator_order_sessions TO service_role;

ALTER TABLE public.operator_order_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active admins can read operator sessions"
  ON public.operator_order_sessions FOR SELECT TO authenticated
  USING (public.is_active_admin(auth.uid()));

CREATE POLICY "Active admins can insert operator sessions"
  ON public.operator_order_sessions FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin(auth.uid()));

CREATE POLICY "Active admins can update operator sessions"
  ON public.operator_order_sessions FOR UPDATE TO authenticated
  USING (public.is_active_admin(auth.uid()))
  WITH CHECK (public.is_active_admin(auth.uid()));

CREATE TRIGGER update_operator_order_sessions_updated_at
  BEFORE UPDATE ON public.operator_order_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();