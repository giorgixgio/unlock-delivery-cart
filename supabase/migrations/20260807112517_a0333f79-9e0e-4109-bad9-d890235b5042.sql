ALTER TABLE public.unidentified_items
ADD COLUMN reason text NOT NULL DEFAULT 'wrong_item'
CHECK (reason IN ('wrong_item', 'not_found')); 