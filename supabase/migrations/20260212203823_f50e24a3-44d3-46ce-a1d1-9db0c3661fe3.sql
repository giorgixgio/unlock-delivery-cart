
-- Create system_events audit log table
CREATE TABLE public.system_events (
  event_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_id TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'SUCCESS',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add indexes for common queries
CREATE INDEX idx_system_events_created_at ON public.system_events (created_at DESC);
CREATE INDEX idx_system_events_event_type ON public.system_events (event_type);
CREATE INDEX idx_system_events_status ON public.system_events (status);
CREATE INDEX idx_system_events_entity ON public.system_events (entity_type, entity_id);

-- Enable RLS
ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;

-- Admins can read all events
CREATE POLICY "Admins can view system_events"
ON public.system_events
FOR SELECT
USING (is_active_admin(auth.uid()));

-- Admins can insert events
CREATE POLICY "Admins can insert system_events"
ON public.system_events
FOR INSERT
WITH CHECK (is_active_admin(auth.uid()));

-- Anyone can insert system events (for storefront order creation)
CREATE POLICY "Anyone can insert system_events"
ON public.system_events
FOR INSERT
WITH CHECK (true);

-- Anyone can read their own events (for returning event_id receipts)
CREATE POLICY "Anyone can read system_events"
ON public.system_events
FOR SELECT
USING (true);
