import { describe, it, expect } from 'vitest';
import { NfseParser } from './nfse-parser';

describe('NfseParser', () => {
  const parser = new NfseParser();

  it('deve extrair dados fiscais do padrão Padrão Nacional (DPS) Não Optante (Lucro Presumido) com perfeição', () => {
    const dpsNacionalXml = `<?xml version="1.0" encoding="UTF-8"?>
    <DPS xmlns="http://www.sped.fazenda.gov.br/nfse">
      <infDPS>
        <nDPS>1487</nDPS>
        <serie>1</serie>
        <prest>
          <CNPJ>55067216000166</CNPJ>
          <xNome>DRA ALICE XAVIER PSIQUIATRIA LTDA</xNome>
          <enderNac>
            <cMun>4314902</cMun>
            <xMun>Porto Alegre</xMun>
            <UF>RS</UF>
            <xLgr>RUA ANTONIO CARLOS BERTA</xLgr>
            <nro>475</nro>
            <xBairro>JARDIM EUROPA</xBairro>
            <CEP>91340020</CEP>
          </enderNac>
        </prest>
        <trib>
          <opcSimpNac>1</opcSimpNac>
          <regEspTrib>0</regEspTrib>
          <cTribNac>041601</cTribNac>
          <cNBS>123011300</cNBS>
          <pAliq>2.00</pAliq>
        </trib>
        <serv>
          <xServ>REFERENTE 1 CONSULTA EM PSIQUIATRA: DRA ALICE XAVIER CRM36948 RQE29510 - REALIZADA NA Data dia 15 de setembro de 2026 em Porto Alegre</xServ>
        </serv>
      </infDPS>
    </DPS>`;

    const data = parser.parse(dpsNacionalXml);

    expect(data.cnpj).toBe('55067216000166');
    expect(data.codigoMunicipioEmissora).toBe('4314902');
    expect(data.codigoOpcaoSimplesNacional).toBe(1);
    expect(data.isOptanteSimples).toBe(false);
    expect(data.regimeTributario).toBe('lucro_presumido');
    expect(data.codigoTributacaoNacionalIss).toBe('041601');
    expect(data.codigoNbs).toBe('123011300');
    expect(data.percentualTotalTributosFederais).toBe('11.33');
    expect(data.cbsAliquota).toBe(0.9);
    expect(data.ibsUfAliquota).toBe(0.1);
    expect(data.crm).toBe('CRM36948');
    expect(data.rqe).toBe('RQE29510');
    expect(data.especialidade).toBe('PSIQUIATRA');
    expect(data.ultimoNumeroDps).toBe(1487);
    expect(data.proximoNumeroDps).toBe(1488);
  });

  it('deve extrair dados fiscais de Optante pelo Simples Nacional corretamente (opcSimpNac = 3)', () => {
    const simplesXml = `<?xml version="1.0" encoding="UTF-8"?>
    <DPS xmlns="http://www.sped.fazenda.gov.br/nfse">
      <infDPS>
        <nDPS>500</nDPS>
        <prest>
          <CNPJ>12345678000195</CNPJ>
          <xNome>CLINICA DERMATOLOGICA DRA MARIANA LTDA</xNome>
          <enderNac>
            <cMun>3550308</cMun>
            <xMun>São Paulo</xMun>
            <UF>SP</UF>
          </enderNac>
        </prest>
        <trib>
          <opcSimpNac>3</opcSimpNac>
          <pAliq>2.00</pAliq>
        </trib>
        <serv>
          <xServ>REFERENTE 1 CONSULTA EM DERMATOLOGISTA: DRA MARIANA SILVA CRM12345</xServ>
        </serv>
      </infDPS>
    </DPS>`;

    const data = parser.parse(simplesXml);

    expect(data.cnpj).toBe('12345678000195');
    expect(data.codigoOpcaoSimplesNacional).toBe(3);
    expect(data.isOptanteSimples).toBe(true);
    expect(data.regimeTributario).toBe('simples_nacional');
    expect(data.percentualTotalTributosFederais).toBe('0.00');
    expect(data.cbsAliquota).toBe(0);
    expect(data.ibsUfAliquota).toBe(0);
    expect(data.crm).toBe('CRM12345');
    expect(data.especialidade).toBe('DERMATOLOGISTA');
    expect(data.proximoNumeroDps).toBe(501);
  });

  it('deve extrair dados fiscais do padrão ABRASF v2 com sucesso', () => {
    const abrasfXml = `<?xml version="1.0" encoding="UTF-8"?>
    <CompNfse xmlns="http://www.abrasf.org.br/nfse.xsd">
      <Nfse>
        <InfNfse>
          <Numero>12345</Numero>
          <ValoresNfse>
            <Aliquota>2.00</Aliquota>
          </ValoresNfse>
          <DeclaracaoPrestacaoServico>
            <InfDeclaracaoPrestacaoServico>
              <Prestador>
                <CpfCnpj>
                  <Cnpj>12345678000195</Cnpj>
                </CpfCnpj>
                <InscricaoMunicipal>98765432</InscricaoMunicipal>
                <RazaoSocial>CLINICA MEDICA DR SILVA LTDA</RazaoSocial>
                <Endereco>
                  <xMun>São Paulo</xMun>
                  <UF>SP</UF>
                </Endereco>
              </Prestador>
              <OptanteSimplesNacional>1</OptanteSimplesNacional>
              <Servico>
                <ItemListaServico>04.01</ItemListaServico>
                <CodigoCnae>8630503</CodigoCnae>
              </Servico>
            </InfDeclaracaoPrestacaoServico>
          </DeclaracaoPrestacaoServico>
        </InfNfse>
      </Nfse>
    </CompNfse>`;

    const data = parser.parse(abrasfXml);

    expect(data.cnpj).toBe('12345678000195');
    expect(data.inscricaoMunicipal).toBe('98765432');
    expect(data.razaoSocial).toBe('CLINICA MEDICA DR SILVA LTDA');
    expect(data.cnae).toBe('8630503');
    expect(data.regimeTributario).toBe('simples_nacional');
    expect(data.isOptanteSimples).toBe(true);
    expect(data.codigoOpcaoSimplesNacional).toBe(3);
    expect(data.aliquotaIss).toBe(2);
    expect(data.codigoMunicipioEmissora).toBe('3550308'); // Mapeado de São Paulo
  });

  it('deve disparar erro quando o XML não possuir CNPJ', () => {
    const invalidXml = `<NotaSemCnpj><Nome>Teste</Nome></NotaSemCnpj>`;
    expect(() => parser.parse(invalidXml)).toThrow('CNPJ do prestador não encontrado');
  });
});
