-- ==============================================================================
-- ADICIONA CAMPOS FISCAIS DA REFORMA TRIBUTÁRIA E NFS-E NACIONAL À TABELA DOCTORS
-- ==============================================================================

ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS fiscal_profile JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS codigo_municipio_ibge VARCHAR(10),
  ADD COLUMN IF NOT EXISTS codigo_opcao_simples_nacional INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS crm VARCHAR(50),
  ADD COLUMN IF NOT EXISTS rqe VARCHAR(50),
  ADD COLUMN IF NOT EXISTS especialidade VARCHAR(100);
