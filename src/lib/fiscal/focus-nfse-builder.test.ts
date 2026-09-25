import { describe, it, expect } from 'vitest';
import {
  buildFocusNfsePayload,
  buildDescricaoServico,
  formatDateToPortuguese,
} from './focus-nfse-builder';
import type { ExtractedFiscalData } from '../xml/nfse-parser';

describe('focus-nfse-builder', () => {
  it('deve converter data ISO para data em português por extenso', () => {
    expect(formatDateToPortuguese('2026-09-15')).toBe('15 de setembro de 2026');
    expect(formatDateToPortuguese('2026-11-12')).toBe('12 de novembro de 2026');
    expect(formatDateToPortuguese('2026-01-05')).toBe('5 de janeiro de 2026');
  });

  it('deve construir a descrição padronizada para data única (Não Optante)', () => {
    const desc = buildDescricaoServico({
      especialidade: 'PSIQUIATRA',
      nomeProfissional: 'DRA ALICE XAVIER',
      crm: 'CRM36948',
      rqe: 'RQE29510',
      dataConsulta: '2026-09-15',
      cidade: 'Porto Alegre',
      isOptanteSimples: false,
    });

    expect(desc).toBe(
      'REFERENTE A 1 CONSULTA REALIZADA COM DRA ALICE XAVIER (RQE: RQE29510 / CRM: CRM36948) NAS DATAS 15 de setembro de 2026.'
    );
  });

  it('deve construir a descrição padronizada para múltiplas datas (Não Optante)', () => {
    const desc = buildDescricaoServico({
      especialidade: 'PSIQUIATRA',
      nomeProfissional: 'DRA ALICE XAVIER',
      crm: 'CRM36948',
      rqe: 'RQE29510',
      datasConsulta: ['2026-08-10', '2026-08-24', '2026-09-07'],
      cidade: 'Porto Alegre',
      isOptanteSimples: false,
    });

    expect(desc).toBe(
      'REFERENTE A 3 CONSULTAS REALIZADAS COM DRA ALICE XAVIER (RQE: RQE29510 / CRM: CRM36948) NAS DATAS 10 de agosto de 2026, 24 de agosto de 2026, 7 de setembro de 2026.'
    );
  });

  it('deve construir a descrição incluindo cláusula obrigatória para Optante Simples Nacional', () => {
    const desc = buildDescricaoServico({
      nomeProfissional: 'DRA ALICE XAVIER',
      crm: 'CRM36948',
      rqe: 'RQE29510',
      dataConsulta: '2026-09-15',
      isOptanteSimples: true,
    });

    expect(desc).toContain('REFERENTE A 1 CONSULTA REALIZADA COM DRA ALICE XAVIER (RQE: RQE29510 / CRM: CRM36948) NAS DATAS 15 de setembro de 2026.');
    expect(desc).toContain('DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL. NAO GERA DIREITO A CREDITO FISCAL DE IPI/ICMS/ISS.');
  });

  it('deve gerar o payload exato para o exemplo do usuário (Não Optante / Lucro Presumido)', () => {
    const mockFiscalNaoOptante: ExtractedFiscalData = {
      cnpj: '55067216000166',
      inscricaoMunicipal: '123456',
      razaoSocial: 'DRA ALICE XAVIER PSIQUIATRIA LTDA',
      cnae: '8630503',
      codigoMunicipioEmissora: '4314902',
      cidade: 'Porto Alegre',
      uf: 'RS',
      codigoOpcaoSimplesNacional: 1,
      regimeTributario: 'lucro_presumido',
      isOptanteSimples: false,
      regimeEspecialTributacao: 0,
      codigoTributacaoNacionalIss: '041601',
      codigoNbs: '123011300',
      itemListaServico: '04.01',
      aliquotaIss: 2,
      percentualTotalTributosFederais: '11.33',
      percentualTotalTributosEstaduais: '0.00',
      percentualTotalTributosMunicipais: '2',
      cbsAliquota: 0.9,
      ibsUfAliquota: 0.1,
      ibsMunAliquota: 0,
      crm: 'CRM36948',
      rqe: 'RQE29510',
      especialidade: 'PSIQUIATRA',
      nomeProfissional: 'DRA ALICE XAVIER',
      serieDps: '1',
      proximoNumeroDps: 1488,
    };

    const patient = {
      name: 'Luiza Baldisserotto',
      cpf: '01355810019',
      phone: '51999610821',
      email: 'luizabaldi2003@gmail.com',
      address: 'RUA ANTONIO CARLOS BERTA',
      number: '475',
      neighborhood: 'JARDIM EUROPA',
      postalCode: '91340020',
      ibgeCityCode: '4314902',
    };

    const appointment = {
      appointmentDate: '2026-09-16',
      amount: 900,
      numeroDps: 1488,
      serieDps: '1',
    };

    const payload = buildFocusNfsePayload(mockFiscalNaoOptante, patient, appointment);

    expect(payload.codigo_municipio_emissora).toBe('4314902');
    expect(payload.cnpj_prestador).toBe('55067216000166');
    expect(payload.codigo_opcao_simples_nacional).toBe(1);
    expect(payload.regime_especial_tributacao).toBe(0);
    expect(payload.razao_social_tomador).toBe('Luiza Baldisserotto');
    expect(payload.codigo_municipio_tomador).toBe('4314902');
    expect(payload.logradouro_tomador).toBe('RUA ANTONIO CARLOS BERTA');
    expect(payload.numero_tomador).toBe('475');
    expect(payload.bairro_tomador).toBe('JARDIM EUROPA');
    expect(payload.cep_tomador).toBe('91340020');
    expect(payload.codigo_municipio_prestacao).toBe('4314902');
    expect(payload.codigo_tributacao_nacional_iss).toBe('041601');
    expect(payload.codigo_nbs).toBe('123011300');
    expect(payload.valor_servico).toBe(900);
    expect(payload.tributacao_iss).toBe(1);
    expect(payload.tipo_retencao_iss).toBe(1);
    expect(payload.serie_dps).toBe('1');
    expect(payload.numero_dps).toBe(1488);
    expect(payload.percentual_total_tributos_federais).toBe('11.33');
    expect(payload.percentual_total_tributos_estaduais).toBe('0.00');
    expect(payload.percentual_total_tributos_municipais).toBe('2');
    expect(payload.finalidade_emissao).toBe(0);
    expect(payload.codigo_indicador_operacao).toBe('030101');
    expect(payload.consumidor_final).toBe(1);
    expect(payload.indicador_destinatario).toBe(0);
    expect(payload.ibs_cbs_situacao_tributaria).toBe('000');
    expect(payload.ibs_cbs_classificacao_tributaria).toBe('000001');
    expect(payload.cbs_aliquota).toBe(0.9);
    expect(payload.ibs_uf_aliquota).toBe(0.1);
    expect(payload.ibs_mun_aliquota).toBe(0);
    expect(payload.cpf_tomador).toBe('01355810019');
    expect(payload.email_tomador).toBe('luizabaldi2003@gmail.com');
    expect(payload.telefone_tomador).toBe('51999610821');
  });

  it('deve gerar o payload diferenciado para Optante pelo Simples Nacional', () => {
    const mockFiscalOptante: ExtractedFiscalData = {
      cnpj: '12345678000195',
      inscricaoMunicipal: '987654',
      razaoSocial: 'DRA ALICE XAVIER ME',
      cnae: '8630503',
      codigoMunicipioEmissora: '4314902',
      cidade: 'Porto Alegre',
      uf: 'RS',
      codigoOpcaoSimplesNacional: 3,
      regimeTributario: 'simples_nacional',
      isOptanteSimples: true,
      regimeEspecialTributacao: 0,
      codigoTributacaoNacionalIss: '041601',
      codigoNbs: '123011300',
      itemListaServico: '04.01',
      aliquotaIss: 2,
      percentualTotalTributosFederais: '0.00',
      percentualTotalTributosEstaduais: '0.00',
      percentualTotalTributosMunicipais: '2',
      cbsAliquota: 0,
      ibsUfAliquota: 0,
      ibsMunAliquota: 0,
      crm: 'CRM36948',
      rqe: 'RQE29510',
      especialidade: 'PSIQUIATRA',
      nomeProfissional: 'DRA ALICE XAVIER',
      serieDps: '1',
      proximoNumeroDps: 1488,
    };

    const patient = {
      name: 'Luiza Baldisserotto',
      cpf: '01355810019',
      phone: '51999610821',
    };

    const appointment = {
      appointmentDate: '2026-09-16',
      amount: 900,
    };

    const payload = buildFocusNfsePayload(mockFiscalOptante, patient, appointment);

    expect(payload.codigo_opcao_simples_nacional).toBe(3);
    expect(payload.percentual_total_tributos_federais).toBe('0.00');
    expect(payload.cbs_aliquota).toBe(0);
    expect(payload.ibs_uf_aliquota).toBe(0);
    expect(payload.ibs_mun_aliquota).toBe(0);
    expect(payload.descricao_servico).toContain('DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL');
  });
});
