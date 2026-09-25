import { PLUGGY_CONFIG } from '@/config/constants';

export interface PluggyTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  status: 'PENDING' | 'POSTED';
  type: 'DEBIT' | 'CREDIT';
}

export class PluggyClient {
  private baseUrl: string;
  private clientId: string;
  private clientSecret: string;
  private apiKey: string | null = null;

  constructor() {
    this.baseUrl = PLUGGY_CONFIG.BASE_URL;
    this.clientId = process.env.PLUGGY_CLIENT_ID || '';
    this.clientSecret = process.env.PLUGGY_CLIENT_SECRET || '';
  }

  private async getApiKey(): Promise<string> {
    if (this.apiKey) return this.apiKey;
    if (!this.clientId || !this.clientSecret) {
      // Retorna token de mock para testes locais
      return 'mock-pluggy-token';
    }

    const res = await fetch(`${this.baseUrl}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: this.clientId,
        clientSecret: this.clientSecret,
      }),
    });

    if (!res.ok) {
      throw new Error(`Falha na autenticação da Pluggy API: ${res.statusText}`);
    }

    const data = await res.json();
    this.apiKey = data.apiKey;
    return this.apiKey!;
  }

  /**
   * Consulta transações de uma conta bancária conectada via Open Finance
   */
  public async getTransactions(accountId: string): Promise<PluggyTransaction[]> {
    const token = await this.getApiKey();
    if (token === 'mock-pluggy-token') {
      return [
        {
          id: 'tx-test-pix',
          description: PLUGGY_CONFIG.TEST_TRANSACTION_DESCRIPTION,
          amount: PLUGGY_CONFIG.TEST_TRANSACTION_AMOUNT,
          date: new Date().toISOString(),
          status: 'POSTED',
          type: 'CREDIT',
        },
      ];
    }

    const res = await fetch(`${this.baseUrl}/transactions?accountId=${encodeURIComponent(accountId)}`, {
      headers: {
        'X-API-KEY': token,
      },
    });

    if (!res.ok) {
      throw new Error(`Erro ao obter transações Pluggy: ${res.statusText}`);
    }

    const data = await res.json();
    return data.results || [];
  }

  /**
   * Verifica se o Pix de teste (R$ 0,01) enviado para a conta foi recebido e conciliado
   */
  public async validateReceivedPix(
    accountId: string,
    expectedAmount = PLUGGY_CONFIG.TEST_TRANSACTION_AMOUNT
  ): Promise<boolean> {
    const transactions = await this.getTransactions(accountId);
    const found = transactions.some(
      (tx) =>
        tx.type === 'CREDIT' &&
        Math.abs(tx.amount - expectedAmount) < 0.001
    );
    return found;
  }
}
