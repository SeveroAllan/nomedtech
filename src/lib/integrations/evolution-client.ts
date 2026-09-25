export interface EvolutionConfigOptions {
  apiUrl?: string;
  apiKey?: string;
}

export interface EvolutionChat {
  id?: string;
  remoteJid?: string;
  remoteJidAlt?: string;
  name?: string;
}

function resolveWebhookUrl(): string {
  const configured =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.WEBHOOK_BASE_URL ||
    process.env.WEBHOOK_URL ||
    'http://localhost:3000';

  const normalized = configured.replace(/\/$/, '');
  return normalized.endsWith('/api/webhooks/evolution')
    ? normalized
    : `${normalized}/api/webhooks/evolution`;
}

export class EvolutionClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(options?: EvolutionConfigOptions) {
    this.apiUrl = (
      options?.apiUrl ||
      process.env.EVOLUTION_API_URL ||
      'http://localhost:8080'
    ).replace(/\/$/, '');
    this.apiKey = options?.apiKey || process.env.EVOLUTION_API_GLOBAL_KEY || '';
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      apikey: this.apiKey,
    };
  }

  public async createInstanceWithQr(
    instanceName: string
  ): Promise<{ instance: string; hash: string }> {
    try {
      await this.deleteInstance(instanceName);
    } catch {
      // A instância pode ainda não existir.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    const response = await fetch(`${this.apiUrl}/instance/create`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        instanceName,
        token: instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      if (response.status === 409 || details.toLowerCase().includes('exist')) {
        await this.setWebhook(instanceName);
        return { instance: instanceName, hash: instanceName };
      }
      throw new Error(`Falha ao criar instância Evolution API (${response.status}): ${details}`);
    }

    const data = await response.json();
    await this.setWebhook(instanceName);
    return data;
  }

  public async deleteInstance(instanceName: string): Promise<boolean> {
    const response = await fetch(`${this.apiUrl}/instance/delete/${instanceName}`, {
      method: 'DELETE',
      headers: this.headers,
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Falha ao apagar instância Evolution (${response.status}): ${await response.text()}`);
    }

    return response.ok;
  }

  public async getQrCode(instanceName: string): Promise<{ qrcode: string }> {
    const response = await fetch(`${this.apiUrl}/instance/connect/${instanceName}`, {
      method: 'GET',
      headers: this.headers,
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Falha ao buscar QR Code (${response.status}): ${details}`);
    }

    const data = await response.json();
    const qrcode = data?.base64 || data?.qrcode?.base64 || data?.code;
    if (!qrcode) {
      throw new Error('QR Code não retornado pela Evolution API.');
    }

    return { qrcode };
  }

  public async setWebhook(
    instanceName: string,
    webhookUrl = resolveWebhookUrl()
  ): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/webhook/set/${instanceName}`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: webhookUrl,
            byEvents: false,
            base64: false,
            events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
          },
        }),
      });
      if (!response.ok) {
        const details = await response.text();
        console.warn('[Evolution] Falha ao configurar webhook:', response.status, details);
      }
      return response.ok;
    } catch (error) {
      console.warn('[Evolution] Falha ao configurar webhook.', error);
      return false;
    }
  }

  public async sendTextMessage(
    instanceName: string,
    number: string,
    text: string
  ): Promise<any> {
    const response = await fetch(`${this.apiUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        number: number.replace(/\D/g, ''),
        text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Erro ao enviar mensagem (${response.status}): ${await response.text()}`);
    }
    return response.json();
  }

  public async sendMediaPdf(
    instanceName: string,
    number: string,
    mediaUrlOrBase64: string | Buffer,
    fileName: string,
    caption?: string
  ): Promise<any> {
    const cleanFileName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    const media = Buffer.isBuffer(mediaUrlOrBase64)
      ? mediaUrlOrBase64.toString('base64')
      : mediaUrlOrBase64;

    const response = await fetch(`${this.apiUrl}/message/sendMedia/${instanceName}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        number: number.replace(/\D/g, ''),
        mediatype: 'document',
        mimetype: 'application/pdf',
        caption: caption || `Nota Fiscal NFS-e - ${cleanFileName}`,
        media,
        fileName: cleanFileName,
      }),
    });

    if (!response.ok) {
      throw new Error(`Erro ao enviar PDF (${response.status}): ${await response.text()}`);
    }
    return response.json();
  }

  public async getInstanceStatus(
    instanceName: string
  ): Promise<{ state: 'open' | 'close' | 'connecting' }> {
    try {
      const response = await fetch(
        `${this.apiUrl}/instance/connectionState/${instanceName}`,
        { method: 'GET', headers: this.headers }
      );
      if (!response.ok) return { state: 'close' };

      const data = await response.json();
      return { state: data.instance?.state || 'close' };
    } catch {
      return { state: 'close' };
    }
  }

  public async findChats(instanceName: string): Promise<EvolutionChat[]> {
    const response = await fetch(`${this.apiUrl}/chat/findChats/${instanceName}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ where: {} }),
    });

    if (!response.ok) {
      throw new Error(`Falha ao buscar conversas históricas (${response.status}): ${await response.text()}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data : data?.chats || data?.records || [];
  }

  public async findMessages(instanceName: string, remoteJid: string): Promise<any[]> {
    const response = await fetch(`${this.apiUrl}/chat/findMessages/${instanceName}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ where: { key: { remoteJid } } }),
    });

    if (!response.ok) {
      throw new Error(`Falha ao buscar mensagens históricas (${response.status}): ${await response.text()}`);
    }

    const data = await response.json();
    return data?.messages?.records || data?.messages || data?.records || (Array.isArray(data) ? data : []);
  }
}
