CREATE TABLE IF NOT EXISTS public.whatsapp_login_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  phone VARCHAR(30) NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_login_otps_lookup_idx
  ON public.whatsapp_login_otps (doctor_id, phone, created_at DESC);

ALTER TABLE public.whatsapp_login_otps ENABLE ROW LEVEL SECURITY;
