# NotoWhats SaaS — Emissão de NFS-e & Gestão Médica no WhatsApp

SaaS Multi-tenant construído em **Next.js 14 (App Router) + Supabase + shadcn/ui**, integrando a API não oficial do WhatsApp (**Evolution API v2**), **Focus NFe** (para emissão e homologação de NFS-e nacional com Certificado Digital A1) e **Pluggy Open Finance** (para validação de titularidade bancária via Pix).

Projetado para hospedagem em **VPS** com build standalone ou Docker containerizado.

---

## 🚀 Fluxo de Onboarding do Médico

1. **Cadastro & Extração Fiscal (XML)**:
   - O médico envia uma mensagem inicial ou o arquivo XML da sua última NFS-e emitida pelo seu município.
   - O motor `NfseParser` extrai instantaneamente: CNPJ, Inscrição Municipal, Razão Social, CNAE, Regime Tributário (Simples Nacional / Lucro Presumido) e Alíquota de ISS.
   - Dados são armazenados no Supabase com isolamento de tenant.

2. **Certificado Digital A1**:
   - O médico envia o arquivo `.pfx` ou `.p12` e digita a senha.
   - O NotoWhats cadastra a empresa emissora na Focus NFe e associa o certificado A1.

3. **Conexão WhatsApp (Evolution API)**:
   - A Evolution API gera um **Pairing Code** (ex: `8492-4102`).
   - O médico conecta seu número diretamente no WhatsApp sem precisar de QR Code.

4. **Validação Bancária via Pluggy (Pix Teste)**:
   - O sistema dispara um Pix de teste de R$ 0,01 para a conta bancária da clínica cadastrada.
   - A Pluggy identifica o crédito e confirma a titularidade da conta.

5. **Emissão de Homologação & Ativação**:
   - A Focus NFe autoriza uma NFS-e de homologação (R$ 1,00).
   - O PDF DANFSE da nota é disparado de volta no WhatsApp do médico.
   - O status do médico é atualizado para `100% Ativo`.

---

## 📱 Comandos Operacionais no WhatsApp

Após a ativação, o médico tem acesso aos 3 comandos:

- 📅 **/agenda [data horários]**:
  - Exemplo: `/agenda 25/10 14h, 15h, 16h`.
  - O bot cria os slots de consulta no banco e dispara **botões interativos de resposta** (`sendButtons`) para os pacientes escolherem o horário desejado com 1 clique.
  - Ao clicar no botão, a consulta é confirmada e registrada no banco de dados.

- 👤 **/cadastro**:
  - Inicia a coleta guiada e conversacional dos dados do paciente: Nome, CPF (validado matematicamente com dígitos verificadores), Telefone e E-mail.
  - Cadastra o paciente no prontuário da clínica.

- 📑 **/notas [mês]**:
  - Exemplo: `/notas 10` ou `/notas outubro`.
  - Localiza todas as notas fiscais (NFS-e) emitidas para aquele médico no mês e envia todos os PDFs diretamente no chat.

---

## 🖥️ Painel Web SaaS (Supabase Dark-First)

- **Visão Geral**: Métricas de faturamento, total de notas emitidas, consultas agendadas e status das integrações em tempo real.
- **Notas Fiscais**: Tabela completa de NFS-e, filtros por mês/competência, download de PDF/XML e botão de emissão de homologação.
- **Agenda & Slots**: Gerenciador de horários com preview em tempo real de como os botões são renderizados no WhatsApp.
- **Pacientes**: Prontuário básico, busca rápida por CPF e atalho para conversar no WhatsApp.
- **Integrações**: Controle de status da Evolution API v2 em tempo real, geração de Pairing Code dinâmico, toggle Homologação/Produção da Focus NFe e contas Pluggy.

---

## 🛠️ Deploy em VPS (Ubuntu / Debian)

### Opção 1: Via Docker & Docker Compose (Recomendado)

```bash
# 1. Clone o repositório na VPS
git clone <url-do-repositorio> /opt/notowhats
cd /opt/notowhats

# 2. Configure as variáveis de ambiente
cp .env.example .env
nano .env

# 3. Suba o container com build standalone
docker-compose up -d --build

# 4. Configure o proxy reverso no Nginx ou Caddy com SSL
# Redirecione https://seu-dominio.com para http://localhost:3000
```

### Opção 2: Via Node.js + PM2

```bash
npm install
npm run build
pm2 start "npm start" --name notowhats-saas
```

---

## 🔒 Segurança & Arquitetura

- **Supabase Row Level Security (RLS)**: Cada médico acessa estritamente seus próprios pacientes, consultas, notas e certificados.
- **Isolamento de Camadas**: Nenhum componente React toca `supabase.from` diretamente. Toda regra de acesso passa por repositórios dedicados (`*.repository.ts`).
- **Segurança do Certificado A1**: O certificado e a chave `service_role` nunca são expostos no frontend; todas as emissões ocorrem no servidor via API Route Handlers.
