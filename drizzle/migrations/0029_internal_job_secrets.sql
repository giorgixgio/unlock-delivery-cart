CREATE TABLE IF NOT EXISTS public.internal_job_secrets (
  name text PRIMARY KEY,
  value text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.internal_job_secrets TO service_role;
REVOKE ALL ON public.internal_job_secrets FROM anon, authenticated;
ALTER TABLE public.internal_job_secrets ENABLE ROW LEVEL SECURITY;
INSERT INTO public.internal_job_secrets (name) VALUES ('sms_delivery_sync') ON CONFLICT DO NOTHING;