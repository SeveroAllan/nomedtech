import { describe, it, expect, vi } from 'vitest';
import { EvolutionClient } from './evolution-client';

describe('EvolutionClient', () => {
  it('deve inicializar com configurações e headers corretos', () => {
    const client = new EvolutionClient({
      apiUrl: 'http://localhost:8080/',
      apiKey: 'test-api-key',
    });

    expect(client).toBeDefined();
  });

  it('deve enviar texto para o número normalizado', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'PENDING' }),
    });
    global.fetch = fetchMock;

    const client = new EvolutionClient({
      apiUrl: 'http://localhost:8080',
      apiKey: 'test-key',
    });

    await client.sendTextMessage('instancia-01', '(51) 99999-8888', 'Mensagem');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/message/sendText/instancia-01');

    const body = JSON.parse(options.body);
    expect(body.number).toBe('51999998888');
    expect(body.text).toBe('Mensagem');
  });

  it('deve usar URL pública do app para registrar o webhook quando configurada', async () => {
    process.env.APP_BASE_URL = 'https://app.exemplo.com';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => 'ok' });
    global.fetch = fetchMock;

    const client = new EvolutionClient({
      apiUrl: 'http://localhost:8080',
      apiKey: 'test-key',
    });

    await client.setWebhook('instancia-01');

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.webhook.url).toBe('https://app.exemplo.com/api/webhooks/evolution');
    delete process.env.APP_BASE_URL;
  });
});
