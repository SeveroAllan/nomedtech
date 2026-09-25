# NotoWhats — Emissão de NFS-e & Gestão Médica no WhatsApp

## Purpose
NotoWhats é um SaaS médico B2B projetado para permitir que médicos e pequenas clínicas automatizem a emissão de notas fiscais de serviço (NFS-e municipal) e a gestão de consultas diretamente pelo WhatsApp, integrando a Evolution API v2, Focus NFe (com certificado digital A1) e Pluggy Open Finance.

## Target Audience
- Médicos autônomos, consultórios particulares e clínicas médicas.
- Profissionais que operam no dia a dia com WhatsApp e precisam emitir NFS-e sem depender de portais municipais complexos ou sistemas legados de ERP.

## Key Capabilities
- **Onboarding Guiado do Médico**:
  1. Extração fiscal instantânea via upload do XML da última NFS-e (CNPJ, Inscrição Municipal, CNAE, Alíquota de ISS, Regime Tributário).
  2. Upload do Certificado Digital A1 (`.pfx` / `.p12`) associado à Focus NFe.
  3. Conexão do WhatsApp via **Pairing Code** de 8 dígitos (sem necessidade de QR Code).
  4. Validação bancária de titularidade via Pix teste de R$ 0,01 com Pluggy Open Finance.
  5. Emissão de NFS-e de homologação (R$ 1,00) e envio imediato do PDF DANFSE no chat do WhatsApp.
- **Comandos no WhatsApp**:
  - `/agenda [data horários]`: Criação de slots de consulta com disparo de botões interativos para os pacientes.
  - `/cadastro`: Fluxo conversacional guiado de cadastro do paciente com validação de CPF.
  - `/notas [mês]`: Envio consolidado dos PDFs das notas fiscais emitidas no mês.
- **Painel Web SaaS**:
  - Visão Geral (KPIs de faturamento, consultas, status em tempo real).
  - Agenda interativa com simulador de visualização no WhatsApp.
  - Tabela de Notas Fiscais com filtros, downloads e emissão de teste.
  - Gestão de Pacientes.
  - Central de Integrações com monitoramento e geração de Pairing Code.

## Architecture & Stack
- **Framework**: Next.js 14 (App Router) + TypeScript + Tailwind CSS.
- **Backend & Auth**: Supabase (PostgreSQL + RLS + Storage + Auth).
- **Integrations**:
  - Evolution API v2 (Docker local / produção).
  - Focus NFe (API REST).
  - Pluggy Open Finance.
- **Design System**: Supabase Dark-First (`#000000`, `#1a1a1a`, `#3ecf8e`).
