-- ==============================================================================
-- NOTOWHATS SAAS MULTI-TENANT SCHEMA
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ENUMS
CREATE TYPE onboarding_status AS ENUM (
  'pending_xml',
  'pending_certificate',
  'pending_whatsapp_connection',
  'pending_pix_validation',
  'homologation_ready',
  'active',
  'suspended'
);

CREATE TYPE invoice_status AS ENUM (
  'draft',
  'processing',
  'authorized',
  'cancelled',
  'error'
);

CREATE TYPE appointment_status AS ENUM (
  'available',
  'reserved',
  'confirmed',
  'completed',
  'cancelled'
);

-- 3. DOCTORS / TENANTS TABLE
CREATE TABLE IF NOT EXISTS public.doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(30) NOT NULL UNIQUE,
  cpf_cnpj VARCHAR(20),
  inscricao_municipal VARCHAR(50),
  cnae VARCHAR(20),
  tax_regime VARCHAR(50) DEFAULT 'simples_nacional',
  iss_rate NUMERIC(5, 2) DEFAULT 2.00,
  city VARCHAR(100),
  state VARCHAR(2),
  onboarding_status onboarding_status DEFAULT 'pending_xml',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. DIGITAL CERTIFICATES TABLE (A1)
CREATE TABLE IF NOT EXISTS public.certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  storage_path TEXT NOT NULL,
  fingerprint VARCHAR(255),
  expires_at TIMESTAMPTZ,
  is_valid BOOLEAN DEFAULT false,
  focus_nfe_validated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. INTEGRATIONS CONFIGURATION
CREATE TABLE IF NOT EXISTS public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL UNIQUE REFERENCES public.doctors(id) ON DELETE CASCADE,
  -- Evolution API
  evolution_instance_name VARCHAR(100) UNIQUE,
  evolution_api_url TEXT,
  evolution_api_key TEXT,
  evolution_connected BOOLEAN DEFAULT false,
  evolution_pairing_code VARCHAR(20),
  -- Focus NFe
  focus_nfe_token TEXT,
  focus_nfe_environment VARCHAR(20) DEFAULT 'homologacao',
  focus_company_id VARCHAR(100),
  -- Pluggy Open Finance
  pluggy_item_id VARCHAR(100),
  pluggy_account_id VARCHAR(100),
  pluggy_pix_key VARCHAR(100),
  pluggy_validated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. PATIENTS TABLE
CREATE TABLE IF NOT EXISTS public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  cpf VARCHAR(20) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  email VARCHAR(255),
  postal_code VARCHAR(10),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(doctor_id, cpf)
);

-- 7. APPOINTMENTS & SCHEDULE SLOTS
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  slot_time TIMESTAMPTZ NOT NULL,
  status appointment_status DEFAULT 'available',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. INVOICES (NFS-E)
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  reference_id VARCHAR(100) NOT NULL,
  invoice_number VARCHAR(50),
  verification_code VARCHAR(100),
  amount NUMERIC(10, 2) NOT NULL,
  description TEXT NOT NULL,
  status invoice_status DEFAULT 'processing',
  environment VARCHAR(20) DEFAULT 'homologacao',
  competence_month VARCHAR(7) NOT NULL, -- YYYY-MM
  pdf_url TEXT,
  xml_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 9. BOT CONVERSATION STATE MACHINE
CREATE TABLE IF NOT EXISTS public.bot_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(30) NOT NULL UNIQUE,
  doctor_id UUID REFERENCES public.doctors(id) ON DELETE CASCADE,
  current_step VARCHAR(50) NOT NULL DEFAULT 'GREETING',
  context_data JSONB DEFAULT '{}'::jsonb,
  last_interaction TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_conversations ENABLE ROW LEVEL SECURITY;

-- Helper function to get current doctor_id
CREATE OR REPLACE FUNCTION public.current_doctor_id()
RETURNS UUID AS $$
  SELECT id FROM public.doctors WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Doctors Policies
CREATE POLICY "Doctors can view and edit their own record"
  ON public.doctors
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Certificates Policies
CREATE POLICY "Doctors manage their own certificates"
  ON public.certificates
  FOR ALL
  USING (doctor_id = public.current_doctor_id())
  WITH CHECK (doctor_id = public.current_doctor_id());

-- Integrations Policies
CREATE POLICY "Doctors manage their own integrations"
  ON public.integrations
  FOR ALL
  USING (doctor_id = public.current_doctor_id())
  WITH CHECK (doctor_id = public.current_doctor_id());

-- Patients Policies
CREATE POLICY "Doctors manage their own patients"
  ON public.patients
  FOR ALL
  USING (doctor_id = public.current_doctor_id())
  WITH CHECK (doctor_id = public.current_doctor_id());

-- Appointments Policies
CREATE POLICY "Doctors manage their own appointments"
  ON public.appointments
  FOR ALL
  USING (doctor_id = public.current_doctor_id())
  WITH CHECK (doctor_id = public.current_doctor_id());

-- Invoices Policies
CREATE POLICY "Doctors manage their own invoices"
  ON public.invoices
  FOR ALL
  USING (doctor_id = public.current_doctor_id())
  WITH CHECK (doctor_id = public.current_doctor_id());
