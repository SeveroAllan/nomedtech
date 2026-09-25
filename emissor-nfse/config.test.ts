import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPrestadorConfig,
  registrarPrestadorConfig,
  limparPrestadoresMemoria,
  validarPrestadorConfig,
  exigirCertificado,
  setPrestadorConfigProvider,
  PrestadorConfig,
} from './config.js';

const PRESTADOR_VALIDO: PrestadorConfig = {
  id: 'medico-1',
  cnpj: '11222333000181',
  im: '123456',
  uf: 'SP',
  codMunicipio: '3550308',
  certPath: './cert-teste.p12',
  certPassword: 'senha',
  ambiente: 2,
  outputDir: 'output/medico-1',
  regTrib: { opSimpNac: 3, regApTribSN: 1, regEspTrib: 0 },
  pTotTribSN: 6.0,
};

test('validarPrestadorConfig valida campos obrigatorios com sucesso', () => {
  assert.doesNotThrow(() => validarPrestadorConfig(PRESTADOR_VALIDO));
});

test('validarPrestadorConfig rejeita CNPJ invalido', () => {
  assert.throws(
    () => validarPrestadorConfig({ ...PRESTADOR_VALIDO, cnpj: '00000000000000' }),
    /CNPJ inválido/,
  );
});

test('validarPrestadorConfig rejeita ambiente diferente de 1 ou 2', () => {
  assert.throws(
    () => validarPrestadorConfig({ ...PRESTADOR_VALIDO, ambiente: 3 as any }),
    /Ambiente inválido/,
  );
});

test('getPrestadorConfig resolve prestador registrado em memoria', () => {
  limparPrestadoresMemoria();
  registrarPrestadorConfig(PRESTADOR_VALIDO);
  const cfg = getPrestadorConfig('medico-1');
  assert.equal(cfg.id, 'medico-1');
  assert.equal(cfg.cnpj, '11222333000181');
});

test('getPrestadorConfig suporta custom provider', () => {
  limparPrestadoresMemoria();
  setPrestadorConfigProvider((id) => {
    if (id === 'medico-2') {
      return {
        ...PRESTADOR_VALIDO,
        id: 'medico-2',
        cnpj: '11444777000161',
      };
    }
    return null;
  });

  const cfg = getPrestadorConfig('medico-2');
  assert.equal(cfg.id, 'medico-2');
  assert.equal(cfg.cnpj, '11444777000161');

  // Limpa provider
  setPrestadorConfigProvider(null);
});

test('getPrestadorConfig lanca erro se prestador nao encontrado', () => {
  limparPrestadoresMemoria();
  setPrestadorConfigProvider(null);
  assert.throws(
    () => getPrestadorConfig('inexistente'),
    /Configuração do prestador "inexistente" não encontrada/,
  );
});

test('exigirCertificado lanca erro se arquivo nao existir no disco', () => {
  assert.throws(
    () => exigirCertificado(PRESTADOR_VALIDO),
    /Certificado não encontrado/,
  );
});
