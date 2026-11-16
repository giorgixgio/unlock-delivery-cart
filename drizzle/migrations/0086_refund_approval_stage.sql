ALTER TABLE public.refund_requests DROP CONSTRAINT refund_requests_status_check;
ALTER TABLE public.refund_requests ADD CONSTRAINT refund_requests_status_check CHECK (status IN ('sent','submitted','approved','bank_submitted','refunded'));
ALTER TABLE public.refund_requests ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.refund_requests ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE public.refund_requests ADD COLUMN IF NOT EXISTS bank_submitted_at timestamptz;