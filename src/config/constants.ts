export const SYSTEM_CONFIG = {
  APP_NAME: 'NotoWhats',
  DESCRIPTION: 'SaaS de Emissão de Notas Fiscais e Gestão Médica via WhatsApp',
  VERSION: '1.0.0',
  DEFAULT_TIMEZONE: 'America/Sao_Paulo',
  DEFAULT_LOCALE: 'pt-BR',
  DEFAULT_CURRENCY: 'BRL',
} as const;

export const FOCUS_NFE_CONFIG = {
  HOMOLOGACAO_URL: 'https://homologacao.focusnfe.com.br/v2',
  PRODUCAO_URL: 'https://api.focusnfe.com.br/v2',
  DEFAULT_ITEM_SERVICO_MEDICO: '04.01', // Medicina e biomedicina
  DEFAULT_ALIQUOTA_ISS: 2.0, // 2%
  DEFAULT_NATUREZA_OPERACAO: '1', // 1 - Tributação no município
} as const;

export const EVOLUTION_CONFIG = {
  DEFAULT_INSTANCE_PREFIX: 'notowhats_medico_',
  DEFAULT_WEBHOOK_EVENTS: [
    'MESSAGES_UPSERT',
    'CONNECTION_UPDATE',
    'QRCODE_UPDATED',
  ] as const,
} as const;

export const PLUGGY_CONFIG = {
  BASE_URL: 'https://api.pluggy.ai',
  TEST_TRANSACTION_AMOUNT: 0.01,
  TEST_TRANSACTION_DESCRIPTION: 'NOTOWHATS VALIDACAO',
} as const;

export const QUICK_REPLY_COMMANDS = {
  AGENDA: '/agenda',
  MARCADO: '/marcado',
  EMISSAO: '/emissao',
} as const;

export const ONBOARDING_STEPS = {
  WELCOME: 'WELCOME',
  AWAITING_XML: 'AWAITING_XML',
  XML_PARSED: 'XML_PARSED',
  AWAITING_CERTIFICATE: 'AWAITING_CERTIFICATE',
  AWAITING_CERT_PASSWORD: 'AWAITING_CERT_PASSWORD',
  AWAITING_WHATSAPP_CONNECT: 'AWAITING_WHATSAPP_CONNECT',
  AWAITING_PIX_VALIDATION: 'AWAITING_PIX_VALIDATION',
  HOMOLOGATION_ISSUED: 'HOMOLOGATION_ISSUED',
  ACTIVE: 'ACTIVE',
} as const;
