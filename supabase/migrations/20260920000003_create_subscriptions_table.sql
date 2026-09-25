-- ==============================================================================
-- TABELA DEDICADA DE ASSINANTES / PLANOS (SUBSCRIPTIONS) NO SUPABASE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL UNIQUE REFERENCES public.doctors(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'free', -- 'free', 'trial', 'active', 'past_due', 'cancelled'
  plan_tier VARCHAR(50) NOT NULL DEFAULT 'free', -- 'free', 'pro', 'clinic'
  is_paying BOOLEAN NOT NULL DEFAULT false,
  free_invoices_limit INT NOT NULL DEFAULT 1, -- Não pagantes geram exatamente 1 nota em sandbox (momento a-ha)
  free_invoices_used INT NOT NULL DEFAULT 0,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  payment_gateway VARCHAR(50) DEFAULT 'mercadopago',
  gateway_subscription_id VARCHAR(255),
  gateway_customer_id VARCHAR(255),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para buscas rápidas
CREATE INDEX IF NOT EXISTS idx_subscriptions_doctor_id ON public.subscriptions(doctor_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_is_paying ON public.subscriptions(is_paying);

-- Habilita RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'subscriptions' AND policyname = 'Permite acesso total para service_role em subscriptions'
  ) THEN
    CREATE POLICY "Permite acesso total para service_role em subscriptions" ON public.subscriptions
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'subscriptions' AND policyname = 'Médicos podem ver sua própria assinatura'
  ) THEN
    CREATE POLICY "Médicos podem ver sua própria assinatura" ON public.subscriptions
      FOR SELECT TO authenticated
      USING (doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()));
  END IF;
END
$$;
