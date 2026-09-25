ALTER TABLE public.patients
  ALTER COLUMN cpf DROP NOT NULL;

COMMENT ON COLUMN public.patients.cpf IS
  'CPF do paciente; pode ficar nulo enquanto o cadastro aguarda os dados para emissão fiscal.';
