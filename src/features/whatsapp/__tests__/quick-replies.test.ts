import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUICK_REPLIES,
  buildServiceDescription,
  extractAmountFromEmissao,
  extractConsultationDatesFromEmissao,
  extractExtraConditionsFromEmissao,
  extractPatientInfoFromText,
  generateQuickRepliesWelcomeMessage,
  isEmissaoTrigger,
  isMarcadoTrigger,
} from '../quick-replies';

describe('Respostas rápidas de automação', () => {
  it('mantém apenas marcado e emissao', () => {
    expect(DEFAULT_QUICK_REPLIES.map((reply) => reply.shortcut)).toEqual([
      '/marcado',
      '/emissao',
    ]);
  });

  it('reconhece o gatilho de marcação', () => {
    expect(isMarcadoTrigger('/marcado')).toBe(true);
    expect(isMarcadoTrigger('Consulta agendada!')).toBe(true);
    expect(isMarcadoTrigger('Atendimento marcado')).toBe(true);
  });

  it('reconhece emissão e extrai o valor informado', () => {
    const textPadrao = 'Vou lhe enviar em instante sua NF no valor de R$ 450,00';
    expect(isEmissaoTrigger(textPadrao)).toBe(true);
    expect(extractAmountFromEmissao(textPadrao)).toBe(450);

    const textComObrigado = 'Obrigado. Vou lhe enviar em instante sua NF no valor de R$ 450,00';
    expect(isEmissaoTrigger(textComObrigado)).toBe(true);
    expect(extractAmountFromEmissao(textComObrigado)).toBe(450);

    const textComCondicionais = 'Vou lhe enviar em instante sua NF no valor de R$ 600,00 das consultas 10/09 e 17/09';
    expect(isEmissaoTrigger(textComCondicionais)).toBe(true);
    expect(extractAmountFromEmissao(textComCondicionais)).toBe(600);
    expect(extractConsultationDatesFromEmissao(textComCondicionais)).toBe('10/09 e 17/09');

    expect(extractAmountFromEmissao('/emissao 1.250,50')).toBe(1250.5);
    expect(extractAmountFromEmissao('NF no valor de R$ ___')).toBe(null);
  });

  it('extrai datas de consultas personalizadas da frase de emissão', () => {
    expect(
      extractConsultationDatesFromEmissao('/emissao R$ 600,00 das consultas 10/09, 17/09 e 24/09')
    ).toBe('10/09, 17/09 e 24/09');

    expect(
      extractConsultationDatesFromEmissao('Vou lhe enviar em instante sua NF no valor de R$ 500 das consultas 05/10 e 12/10.')
    ).toBe('05/10 e 12/10');

    expect(
      extractConsultationDatesFromEmissao('/emissao 300 da consulta 15/09/2026')
    ).toBe('15/09/2026');

    expect(
      extractConsultationDatesFromEmissao('/emissao R$ 250')
    ).toBe(null);
  });

  it('extrai condicionais extras a partir do valor na frase padrão de emissão', () => {
    const semCondicionais = 'Vou lhe enviar em instante sua NF no valor de R$ 450,00';
    expect(extractExtraConditionsFromEmissao(semCondicionais)).toBe(null);

    const comConsultas = 'Vou lhe enviar em instante sua NF no valor de R$ 600,00 das consultas 10/09 e 17/09';
    expect(extractExtraConditionsFromEmissao(comConsultas)).toBe('das consultas 10/09 e 17/09');

    const comSingular = 'Vou lhe enviar em instante sua NF no valor de 350 da consulta 10/09.';
    expect(extractExtraConditionsFromEmissao(comSingular)).toBe('da consulta 10/09');

    const comOutraCondicional = 'Vou lhe enviar em instante sua NF no valor de R$ 800 referente a retorno e procedimentos';
    expect(extractExtraConditionsFromEmissao(comOutraCondicional)).toBe('referente a retorno e procedimentos');
  });

  it('monta a descrição do serviço considerando as condicionais extras ou fallback', () => {
    expect(
      buildServiceDescription('Dr. Allan Severo', '2026-09-25', null)
    ).toBe('CONSULTA MEDICA REALIZADA EM 2026-09-25 COM DR. ALLAN SEVERO');

    expect(
      buildServiceDescription('Dr. Allan Severo', '2026-09-25', 'das consultas 10/09 e 17/09')
    ).toBe('CONSULTA MEDICA REALIZADA DAS CONSULTAS 10/09 E 17/09 COM DR. ALLAN SEVERO');

    expect(
      buildServiceDescription('Dr. Allan Severo', '2026-09-25', 'da consulta 10/09')
    ).toBe('CONSULTA MEDICA REALIZADA DA CONSULTA 10/09 COM DR. ALLAN SEVERO');

    expect(
      buildServiceDescription('Dr. Allan Severo', '2026-09-25', 'referente a retorno')
    ).toBe('CONSULTA MEDICA REALIZADA REFERENTE A RETORNO COM DR. ALLAN SEVERO');

    // Com dados profissionais completos (CRM, RQE e especialidade)
    expect(
      buildServiceDescription(
        {
          name: 'Dr. Allan Severo',
          crm: '12345/RS',
          rqe: '98765',
          especialidade: 'Cardiologia',
        },
        '2026-09-25',
        null
      )
    ).toBe('CONSULTA MEDICA REALIZADA EM 2026-09-25 COM DR. ALLAN SEVERO - CRM 12345/RS - RQE 98765 - (CARDIOLOGIA)');

    // Com dados profissionais e condicionais de datas
    expect(
      buildServiceDescription(
        {
          name: 'Dr. Allan Severo',
          crm: 'CRM/RS 12345',
          rqr: 'RQR 98765',
        },
        '2026-09-25',
        'das consultas 10/09 e 17/09'
      )
    ).toBe('CONSULTA MEDICA REALIZADA DAS CONSULTAS 10/09 E 17/09 COM DR. ALLAN SEVERO - CRM/RS 12345 - RQR 98765');
  });

  it('extrai dados cadastrais básicos para fallback', () => {
    expect(
      extractPatientInfoFromText(
        'Nome: Carlos Eduardo Santos\nCPF: 529.982.247-25\nE-mail: carlos@example.com'
      )
    ).toEqual({
      name: 'Carlos Eduardo Santos',
      cpf: '52998224725',
      email: 'carlos@example.com',
    });
  });

  it('publica apenas os dois gatilhos ativos', () => {
    const welcome = generateQuickRepliesWelcomeMessage('Lucas');
    expect(welcome).not.toContain('/agenda');
    expect(welcome).toContain('/marcado');
    expect(welcome).toContain('/emissao');
    expect(welcome).not.toContain('/cadastro');
    expect(welcome).not.toContain('/comprovante');
  });
});
