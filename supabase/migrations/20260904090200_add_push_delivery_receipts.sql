ALTER TABLE public.push_delivery_attempts
    ADD COLUMN IF NOT EXISTS receipt_token uuid DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS displayed_at timestamptz,
    ADD COLUMN IF NOT EXISTS clicked_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS push_delivery_attempts_receipt_token_idx
    ON public.push_delivery_attempts (receipt_token)
    WHERE receipt_token IS NOT NULL;

