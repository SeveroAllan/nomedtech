import { test } from 'node:test';
import assert from 'node:assert/strict';

import { montarDps, DEFAULTS } from './emissor.js';
import { registrarPrestadorConfig, limparPrestadoresMemoria, PrestadorConfig } from './config.js';

const PRESTADOR_MEDICO: PrestadorConfig = {
  id: 'medico-teste',
  cnpj: '11222333000181',
  im: '123456',
  uf: 'SP',
  codMunicipio: '3550308',
  certPath: './cert-teste.p12',
  certPassword: 'senha',
  ambiente: 2,
  outputDir: 'output/medico-teste',
  regTrib: { opSimpNac: 3, regApTribSN: 1, regEspTrib: 0 },
  pTotTribSN: 6.0,
};

test('emissor.montarDps resolve prestador correto por prestadorId', () => {
  limparPrestadoresMemoria();
  registrarPrestadorConfig(PRESTADOR_MEDICO);

  const dps = montarDps(DEFAULTS, 'medico-teste');
  assert.equal(dps.infDps.prest.CNPJ, '11222333000181');
  assert.equal(dps.infDps.prest.IM, '123456');
  assert.equal(dps.infDps.cLocEmi, '3550308');
});

test('emissor.montarDps aceita objeto PrestadorConfig diretamente', () => {
  const dps = montarDps(DEFAULTS, PRESTADOR_MEDICO);
  assert.equal(dps.infDps.prest.CNPJ, '11222333000181');
});
