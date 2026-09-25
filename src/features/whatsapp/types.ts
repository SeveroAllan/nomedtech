import type { Json } from '@/types/database.types';

export interface WhatsAppMessagePayload {
  event: string;
  instance: string;
  data: {
    key: {
      remoteJid: string;
      fromMe: boolean;
      id: string;
    };
    pushName?: string;
    message?: {
      conversation?: string;
      extendedTextMessage?: {
        text?: string;
      };
      documentMessage?: {
        url?: string;
        mimetype?: string;
        title?: string;
        fileName?: string;
      };
      buttonsResponseMessage?: {
        selectedButtonId?: string;
        selectedDisplayText?: string;
      };
    };
    messageType?: string;
  };
}

export interface BotContextData {
  xmlData?: {
    cnpj: string;
    razaoSocial: string;
    inscricaoMunicipal: string;
    cnae: string;
    regimeTributario: string;
    aliquotaIss: number;
  };
  certFileBase64?: string;
  pairingCode?: string;
  patientRegistration?: {
    step: 'NAME' | 'CPF' | 'PHONE' | 'EMAIL' | 'CEP';
    name?: string;
    cpf?: string;
    phone?: string;
    email?: string;
    cep?: string;
  };
  [key: string]: any;
}
