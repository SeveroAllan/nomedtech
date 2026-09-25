-- ==============================================================================
-- TABELA DE INTEGRAÇÕES GOOGLE (GMAIL, GOOGLE DRIVE E GOOGLE AGENDA)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.google_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL UNIQUE REFERENCES public.doctors(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expiry TIMESTAMPTZ,
  google_email VARCHAR(255),
  google_name VARCHAR(255),
  google_avatar_url TEXT,
  scopes TEXT[] DEFAULT '{}',
  drive_folder_id VARCHAR(255),
  drive_folder_name VARCHAR(255) DEFAULT 'NotoWhats - Notas Fiscais',
  auto_send_gmail BOOLEAN DEFAULT true,
  auto_upload_drive BOOLEAN DEFAULT true,
  last_calendar_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_google_integrations_doctor_id ON public.google_integrations(doctor_id);
CREATE INDEX IF NOT EXISTS idx_google_integrations_google_email ON public.google_integrations(google_email);

-- Habilita RLS
ALTER TABLE public.google_integrations ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'google_integrations' AND policyname = 'Permite acesso total para service_role em google_integrations'
  ) THEN
    CREATE POLICY "Permite acesso total para service_role em google_integrations" ON public.google_integrations
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'google_integrations' AND policyname = 'Médicos podem gerenciar sua própria integração Google'
  ) THEN
    CREATE POLICY "Médicos podem gerenciar sua própria integração Google" ON public.google_integrations
      FOR ALL TO authenticated
      USING (doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()))
      WITH CHECK (doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()));
  END IF;
END
$$;
