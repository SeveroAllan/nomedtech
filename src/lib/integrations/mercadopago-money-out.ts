import crypto from 'crypto';

export type PixKeyType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP';

export interface PixAccountDestination {
  type?: 'current' | 'savings';
  amount: number;
  chave: {
    type: PixKeyType;
    value: string;
  };
  owner: {
    identification: {
      type: 'CPF' | 'CNPJ';
      number: string;
    };
    name?: string;
  };
}

export interface BankAccountDestination {
  type: 'current' | 'savings';
  amount: number;
  bank_id: string;
  branch: string;
  account_number: string;
  owner: {
    identification: {
      type: 'CPF' | 'CNPJ';
      number: string;
    };
    name?: string;
  };
}

export interface SendPixTransferParams {
  doctorId: string;
  amount?: number; // Padrão: 0.01
  pixKey: string;
  pixKeyType?: PixKeyType;
  ownerTaxId: string; // CPF ou CNPJ
  ownerName?: string;
  externalReference?: string;
  notificationUrl?: string;
  idempotencyKey?: string;
}

export interface MercadoPagoTransferIntentResponse {
  id: string;
  status: 'pending' | 'processed' | 'rejected' | 'failed' | 'cancelled' | 'in_process';
  status_detail?: string;
  external_reference?: string;
  point_of_interaction?: {
    type: string;
  };
  transaction?: {
    total_amount: number;
    from?: { accounts: Array<{ amount: number }> };
    to?: { accounts: Array<any> };
  };
  date_created?: string;
  date_last_updated?: string;
  _simulated?: boolean;
  [key: string]: any;
}

export interface MercadoPagoClientConfig {
  accessToken?: string;
  environment?: 'sandbox' | 'production' | 'test';
  privateKey?: string; // Para assinatura criptográfica ponta a ponta em produção
  publicKeyId?: string; // ID da chave pública correspondente no Mercado Pago
  notificationUrl?: string;
}

/**
 * Utilitário para identificar tipo de chave Pix a partir da string
 */
export function detectPixKeyType(key: string): PixKeyType {
  const clean = key.trim();
  const digitsOnly = clean.replace(/\D/g, '');

  if (clean.includes('@')) {
    return 'EMAIL';
  }
  // UUID (EVP - Chave Aleatória)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) {
    return 'EVP';
  }
  if (clean.startsWith('+') || clean.includes('(') || digitsOnly.length === 12 || digitsOnly.length === 13) {
    return 'PHONE';
  }
  if (digitsOnly.length === 14) {
    return 'CNPJ';
  }
  if (digitsOnly.length === 11) {
    return 'CPF';
  }

  return 'CPF';
}

/**
 * Cliente para a API Mercado Pago Money Out
 * Documentação: https://www.mercadopago.com.br/developers/pt/docs/money-out/integration-configuration
 */
export class MercadoPagoMoneyOutClient {
  private accessToken: string;
  private environment: 'sandbox' | 'production' | 'test';
  private privateKey?: string;
  private publicKeyId?: string;
  private defaultNotificationUrl: string;
  private baseUrl: string = 'https://api.mercadopago.com';

  constructor(config: MercadoPagoClientConfig = {}) {
    this.accessToken =
      config.accessToken ||
      process.env.MERCADO_PAGO_ACCESS_TOKEN ||
      'TEST-00000000-0000-0000-0000-000000000000';
    this.environment =
      config.environment ||
      ((process.env.MERCADO_PAGO_ENV as any) || 'sandbox');
    this.privateKey = config.privateKey || process.env.MERCADO_PAGO_PRIVATE_KEY;
    this.publicKeyId = config.publicKeyId || process.env.MERCADO_PAGO_PUBLIC_KEY_ID;

    const domain =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    this.defaultNotificationUrl =
      config.notificationUrl ||
      process.env.MERCADO_PAGO_NOTIFICATION_URL ||
      `${domain}/api/webhooks/mercadopago`;
  }

  /**
   * Gera assinatura ponta a ponta obrigatória para ambiente de produção
   * Conforme especificação: https://www.mercadopago.com.br/developers/pt/docs/money-out/end-to-end-encryption
   */
  public generateSignature(bodyString: string): string | null {
    if (!this.privateKey) return null;

    try {
      // Suporte a RSA SHA-256
      const sign = crypto.createSign('SHA256');
      sign.update(bodyString);
      sign.end();
      return sign.sign(this.privateKey, 'base64');
    } catch (err) {
      console.warn('Falha na assinatura RSA com chave privada, tentando HMAC:', err);
      try {
        return crypto.createHmac('sha256', this.privateKey).update(bodyString).digest('base64');
      } catch (hmacErr) {
        console.error('Falha ao assinar payload do Mercado Pago:', hmacErr);
        return null;
      }
    }
  }

  /**
   * Monta o payload de transferência Pix Money Out
   */
  public buildTransferPayload(params: SendPixTransferParams) {
    const amount = Number((params.amount ?? 0.01).toFixed(2));
    const cleanTaxId = params.ownerTaxId.replace(/\D/g, '');
    const detectedKeyType = params.pixKeyType || detectPixKeyType(params.pixKey);
    const cleanPixKey =
      detectedKeyType === 'CPF' || detectedKeyType === 'CNPJ'
        ? params.pixKey.replace(/\D/g, '')
        : params.pixKey.trim();

    const taxType: 'CPF' | 'CNPJ' = cleanTaxId.length === 14 ? 'CNPJ' : 'CPF';
    const externalReference =
      params.externalReference || `DOC_${params.doctorId}_${Date.now()}`;
    const notificationUrl = params.notificationUrl || this.defaultNotificationUrl;

    return {
      external_reference: externalReference,
      point_of_interaction: {
        type: 'PSP_TRANSFER',
      },
      seller_configuration: {
        notification_info: {
          notification_url: notificationUrl,
        },
      },
      transaction: {
        from: {
          accounts: [
            {
              amount,
            },
          ],
        },
        to: {
          accounts: [
            {
              type: 'current',
              amount,
              chave: {
                type: detectedKeyType,
                value: cleanPixKey,
              },
              owner: {
                identification: {
                  type: taxType,
                  number: cleanTaxId,
                },
                ...(params.ownerName ? { name: params.ownerName } : {}),
              },
            },
          ],
        },
        total_amount: amount,
      },
    };
  }

  /**
   * 1. Chamada Principal: Cria e processa a transferência Pix (Money Out)
   * POST https://api.mercadopago.com/v1/transaction-intents/process
   */
  public async sendPixTransfer(
    params: SendPixTransferParams
  ): Promise<MercadoPagoTransferIntentResponse> {
    const idempotencyKey = params.idempotencyKey || crypto.randomUUID();
    const payload = this.buildTransferPayload(params);
    const bodyString = JSON.stringify(payload);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.accessToken}`,
      'X-Idempotency-Key': idempotencyKey,
    };

    // No ambiente de teste / sandbox, envia X-Test-Token: true
    if (this.environment !== 'production') {
      headers['X-Test-Token'] = 'true';
    } else {
      // No ambiente de produção, assina o payload
      const signature = this.generateSignature(bodyString);
      if (signature) {
        headers['X-Signature'] = signature;
        if (this.publicKeyId) {
          headers['X-Public-Key-Id'] = this.publicKeyId;
        }
      }
    }

    // Se estiver sem credenciais reais no ambiente local ou com prefixo de teste genérico,
    // simula com sucesso conforme a tabela de teste do guia Money Out
    if (
      !process.env.MERCADO_PAGO_ACCESS_TOKEN ||
      this.accessToken.includes('00000000') ||
      this.accessToken.startsWith('TEST-0000')
    ) {
      return {
        id: `mpi_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`,
        status: 'processed',
        status_detail: 'accredited',
        external_reference: payload.external_reference,
        point_of_interaction: payload.point_of_interaction,
        transaction: payload.transaction,
        date_created: new Date().toISOString(),
        date_last_updated: new Date().toISOString(),
        _simulated: true,
      };
    }

    const endpoint = `${this.baseUrl}/v1/transaction-intents/process`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: bodyString,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errorMsg =
        data?.message ||
        data?.error ||
        `Erro ${res.status} ao processar Pix Money Out no Mercado Pago`;
      const err: any = new Error(errorMsg);
      err.status = res.status;
      err.details = data;
      throw err;
    }

    return data;
  }

  /**
   * 2. Consulta os detalhes de uma transação pelo ID
   * GET https://api.mercadopago.com/v1/transaction-intents/{id}
   */
  public async getTransaction(
    transactionId: string
  ): Promise<MercadoPagoTransferIntentResponse> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
    };

    if (this.environment !== 'production') {
      headers['X-Test-Token'] = 'true';
    }

    // Fallback de simulação se token for sandbox genérico sem rede
    if (
      !process.env.MERCADO_PAGO_ACCESS_TOKEN ||
      this.accessToken.includes('00000000') ||
      this.accessToken.startsWith('TEST-000')
    ) {
      return {
        id: transactionId,
        status: 'processed',
        status_detail: 'accredited',
        external_reference: `DOC_simulated_${Date.now()}`,
        transaction: {
          total_amount: 0.01,
        },
        date_created: new Date().toISOString(),
        date_last_updated: new Date().toISOString(),
        _simulated: true,
      };
    }

    const endpoint = `${this.baseUrl}/v1/transaction-intents/${transactionId}`;

    const res = await fetch(endpoint, {
      method: 'GET',
      headers,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errorMsg =
        data?.message ||
        data?.error ||
        `Erro ${res.status} ao consultar transação ${transactionId} no Mercado Pago`;
      const err: any = new Error(errorMsg);
      err.status = res.status;
      err.details = data;
      throw err;
    }

    return data;
  }
}
