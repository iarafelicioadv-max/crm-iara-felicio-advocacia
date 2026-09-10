'use strict';

const assert = require('assert');
const {
  gerarPdfProcuracao,
  normalizarDadosProcuracao,
  validarDadosProcuracao,
  formatarCpf,
} = require('../procuracao');

async function principal() {
  assert.strictEqual(formatarCpf('03275269631'), '032.752.696-31');

  const dados = normalizarDadosProcuracao({
    nome: 'Cristiane de Souza e Silva',
    cpf: '032.752.696-31',
    rg: 'MG-12.345.678',
    orgaoEmissor: 'SSP/MG',
    nacionalidade: 'brasileira',
    estadoCivil: 'casada',
    profissao: 'autônoma',
    enderecoCompleto: 'Rua Joaquim Alves Tavares, nº 445, Bairro São João, Conselheiro Lafaiete/MG, CEP 36.404-148',
    localAssinatura: 'Caratinga',
    dataAssinatura: '2026-09-10',
  }, {});

  assert.deepStrictEqual(validarDadosProcuracao(dados), []);

  const pdf = await gerarPdfProcuracao(dados);
  assert.ok(Buffer.isBuffer(pdf));
  assert.ok(pdf.length > 1000, 'PDF gerado parece vazio demais');
  assert.strictEqual(pdf.slice(0, 5).toString('ascii'), '%PDF-');

  const faltantes = validarDadosProcuracao(normalizarDadosProcuracao({}, {}));
  assert.ok(faltantes.length > 0, 'deveria exigir campos obrigatórios sem dados');

  console.log('OK: geração do PDF da procuração com timbrado validada.');
}

principal().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
