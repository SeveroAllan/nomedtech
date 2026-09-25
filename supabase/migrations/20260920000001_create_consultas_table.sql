-- ==============================================================================
-- TABELA DEDICADA DE CONSULTAS COM DATA E HORA SEPARADAS E TRAVA DE DUPLICIDADE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.consultas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  hora TIME NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'confirmed', -- 'confirmed', 'completed', 'cancelled'
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- Segurança contra agendamento duplicado no mesmo horário para o mesmo médico
  CONSTRAINT uq_medico_data_hora UNIQUE (doctor_id, data, hora)
);

-- Habilita RLS
ALTER TABLE public.consultas ENABLE ROW LEVEL SECURITY;

-- Política para service_role (bot do WhatsApp e backend)
CREATE POLICY "Permite acesso total para service_role" ON public.consultas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Política para o médico autenticado ver apenas suas consultas
CREATE POLICY "Médicos podem gerenciar suas consultas" ON public.consultas
  FOR ALL TO authenticated
  USING (doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()))
  WITH CHECK (doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()));
