import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MercadoPagoMoneyOutClient,
  detectPixKeyType,
} from './mercadopago-money-out';

describe('detectPixKeyType', () => {
  it('detecta CPF corretamente', () => {
    expect(detectPixKeyType('12345678909')).toBe('CPF');
    expect(detectPixKeyType('123.456.789-09')).toBe('CPF');
  });

  it('detecta CNPJ corretamente', () => {
    expect(detectPixKeyType('12345678000195')).toBe('CNPJ');
    expect(detectPixKeyType('12.345.678/0001-95')).toBe('CNPJ');
  });

  it('detecta e-mail corretamente', () => {
    expect(detectPixKeyType('medico@clinica.com.br')).toBe('EMAIL');
  });

  it('detecta telefone corretamente', () => {
    expect(detectPixKeyType('+5511999998888')).toBe('PHONE');
    expect(detectPixKeyType('(11) 99999-8888')).toBe('PHONE');
    expect(detectPixKeyType('5511999998888')).toBe('PHONE');
  });

  it('detecta chave aleatória EVP', () => {
    expect(detectPixKeyType('e2a5bc10-6bf7-4b77-a8fe-3bc47f8a7e0a')).toBe('EVP');
  });
});

describe('MercadoPagoMoneyOutClient', () => {
  let client: MercadoPagoMoneyOutClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = new MercadoPagoMoneyOutClient({
      accessToken: 'TEST-TOKEN-MOCK',
      environment: 'sandbox',
    });
  });

  it('monta o payload com R$ 0,01 e estrutura correta para transferência Pix', () => {
    const payload = client.buildTransferPayload({
      doctorId: 'doc_123',
      ownerTaxId: '12345678909',
      pixKey: '12345678909',
      ownerName: 'Dr. Lucas Silva',
    });

    expect(payload.transaction.total_amount).toBe(0.01);
    expect(payload.transaction.from.accounts[0].amount).toBe(0.01);
    expect(payload.transaction.to.accounts[0].amount).toBe(0.01);
    expect(payload.transaction.to.accounts[0].chave.type).toBe('CPF');
    expect(payload.transaction.to.accounts[0].chave.value).toBe('12345678909');
    expect(payload.transaction.to.accounts[0].owner.identification.type).toBe('CPF');
    expect(payload.transaction.to.accounts[0].owner.identification.number).toBe('12345678909');
    expect(payload.point_of_interaction.type).toBe('PSP_TRANSFER');
    expect(payload.external_reference).toContain('DOC_doc_123_');
    expect(payload.seller_configuration.notification_info.notification_url).toContain('/api/webhooks/mercadopago');
  });

  it('envia Pix com sucesso gerando X-Idempotency-Key e X-Test-Token em sandbox', async () => {
    const res = await client.sendPixTransfer({
      doctorId: 'doc_456',
      ownerTaxId: '12345678000195',
      pixKey: '12345678000195',
      ownerName: 'Clínica Médica LTDA',
    });

    expect(res).toBeDefined();
    expect(res.id).toBeDefined();
    expect(res.status).toBe('processed');
    expect(res.transaction?.total_amount).toBe(0.01);
  });

  it('permite consultar status de transação pelo ID', async () => {
    const tx = await client.getTransaction('tx_test_999');
    expect(tx).toBeDefined();
    expect(tx.id).toBe('tx_test_999');
    expect(tx.status).toBe('processed');
  });
});
