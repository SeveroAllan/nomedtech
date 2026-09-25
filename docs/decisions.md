# Decisões de Arquitetura — NotoWhats SaaS

## ADR 001: Next.js App Router para Hospedagem em VPS
- **Data**: 2026-09-19
- **Contexto**: A plataforma precisava rodar tanto os webhooks do WhatsApp (Evolution API), Focus NFe e Pluggy quanto o painel administrativo multi-tenant.
- **Decisão**: Adotar Next.js 14 com App Router e `output: 'standalone'`. Isso permite que a aplicação seja empacotada em uma imagem Docker enxuta ou executada com Node.js/PM2 em uma VPS única, reduzindo custos de infraestrutura e unificando backend de webhooks e frontend em um único deploy atômico.

## ADR 002: Isolamento Multi-Tenant via Supabase RLS
- **Data**: 2026-09-19
- **Contexto**: O sistema atende múltiplos médicos simultaneamente, cada um com seus pacientes, agenda e notas fiscais.
- **Decisão**: Utilizar Row Level Security (RLS) nativo do Supabase. Toda tabela possui `tenant_id` ou `doctor_id` com políticas atreladas a `auth.uid()`. Nenhum componente React chama `supabase.from` diretamente; todas as chamadas passam por repositories dedicados (`*.repository.ts`).

## ADR 003: Separação Estrita de Camadas por Feature
- **Data**: 2026-09-19
- **Contexto**: Evitar arquitetura "espaguete" e garantir manutenibilidade para desenvolvimento com IA e múltiplos devs.
- **Decisão**: Cada domínio (`auth`, `onboarding`, `invoices`, `schedule`, `patients`, `whatsapp`) possui sua própria pasta contendo `components`, `hooks`, `services`, `*.repository.ts` e `types.ts`. Componentes shadcn vendorizados ficam isolados em `src/components/ui`.

## ADR 004: Parser Multi-Padrão de XML de NFS-e
- **Data**: 2026-09-19
- **Contexto**: No Brasil não existe padrão único de NFS-e entre os municípios (ABRASF v1/v2, Paulistana, DSF, Betha, etc.).
- **Decisão**: Criar um parser resiliente que analisa a árvore XML em múltiplos nós conhecidos (`IdentificacaoRps`, `DadosPrestador`, `IdentificacaoPrestador`, `Emitente`, `ValoresServico`) para extrair CNPJ, Inscrição Municipal, CNAE, Regime Tributário e Alíquotas com fallbacks seguros.

## ADR 005: State Machine para Bot Conversacional no WhatsApp
- **Data**: 2026-09-19
- **Contexto**: O médico realiza tanto o onboarding (envio de XML, certificado A1, conexão e teste) quanto comandos do dia a dia (`/agenda`, `/cadastro`, `/notas`) pelo WhatsApp.
- **Decisão**: Implementar uma máquina de estados finita armazenada no banco (`bot_conversations`), permitindo conversas assíncronas persistentes e tolerantes a reinicializações do servidor.
