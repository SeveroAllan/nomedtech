-- Execute no Supabase SQL Editor antes de usar o botão
-- "Conectar WhatsApp e importar dados".

CREATE TABLE IF NOT EXISTS public.whatsapp_history_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  instance_name VARCHAR(100) NOT NULL,
  terms_version VARCHAR(30) NOT NULL,
  purpose VARCHAR(120) NOT NULL DEFAULT 'patient_contact_data_import',
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'cancelled', 'failed')),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  connected_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (doctor_id, instance_name)
);

CREATE INDEX IF NOT EXISTS whatsapp_history_consents_doctor_idx
  ON public.whatsapp_history_consents (doctor_id);

ALTER TABLE public.whatsapp_history_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_history_consents FROM anon, authenticated;
