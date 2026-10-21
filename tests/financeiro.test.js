'use strict';

const assert = require('assert');
const { adicionarMes, normalizarContrato, calcularFinanceiro } = require('../financeiro');

assert.strictEqual(adicionarMes('2026-01-31', 1), '2026-02-28');
assert.strictEqual(adicionarMes('2024-01-31', 1), '2024-02-29');

const contrato = normalizarContrato({
  id: 7,
  clienteId: 11,
  descricao: 'Honorários contratuais',
  valorTotal: 3948,
  numeroParcelasCliente: 12,
  valorParcelaCliente: 329,
  formaPagamento: 'Cartão de crédito',
  taxaCartaoValor: 348,
  valorLiquidoPrevisto: 3600,
  numeroRepasses: 1,
  dataPrimeiroRepasse: '2026-08-20',
  status: 'Ativo',
  honorarioExitoPercentual: 30,
});

assert.strictEqual(contrato.parcelasCliente.length, 12);
assert.strictEqual(contrato.parcelasCliente[0].valor, 329);
assert.strictEqual(contrato.parcelasCliente.reduce((s, p) => s + p.valor, 0), 3948);
assert.strictEqual(contrato.repasses.length, 1);
assert.strictEqual(contrato.repasses[0].valor, 3600);
assert.strictEqual(contrato.repasses[0].vencimento, '2026-08-20');

const financeiro = calcularFinanceiro({ contratos: [contrato], pagamentos: [] }, '2026-08-18');
assert.strictEqual(financeiro.totalContratado, 3948);
assert.strictEqual(financeiro.totalTaxasCartao, 348);
assert.strictEqual(financeiro.totalLiquidoPrevisto, 3600);
assert.strictEqual(financeiro.aReceber, 3600);
assert.strictEqual(financeiro.vencido, 0);
assert.strictEqual(financeiro.projecao30, 3600);
assert.strictEqual(financeiro.projecao60, 3600);
assert.strictEqual(financeiro.contratos[0].repassesRecebidos, 0);

const comPagamento = calcularFinanceiro({
  contratos: [contrato],
  pagamentos: [{ id: 1, contratoId: 7, data: '2026-08-20', valor: 3600 }],
}, '2026-08-20');
assert.strictEqual(comPagamento.aReceber, 0);
assert.strictEqual(comPagamento.vencido, 0);
assert.strictEqual(comPagamento.contratos[0].repassesRecebidos, 1);
assert.strictEqual(comPagamento.contratos[0].proximoVencimento, null);

console.log('OK: parcelamento da cliente separado do repasse líquido do cartão.');

// ---- Contas a pagar e extrato geral ----
const { calcularFinanceiro: calc } = require('../financeiro');
const dbDesp = {
  contratos: [], clientes: [],
  pagamentos: [{ id: 1, data: '2026-10-05', valor: 1000, descricao: 'Honorários' }],
  despesas: [
    { id: 1, data: '2026-10-02', categoria: 'Aluguel', descricao: 'Aluguel', valor: 300 },
    { id: 2, data: '2026-10-10', categoria: 'Software', descricao: 'Sistema', valor: 100, status: 'Pendente' },
    { id: 3, data: '2026-10-25', categoria: 'Internet', descricao: 'Internet', valor: 50, status: 'Pendente' },
    { id: 4, data: '2026-12-01', categoria: 'Contador', descricao: 'Contador', valor: 200, status: 'Pendente' },
  ],
};
const r = calc(dbDesp, '2026-10-21');
assert.strictEqual(r.totalDespesas, 300, 'pendentes não entram nas despesas pagas');
assert.strictEqual(r.saldoGeral, 700);
assert.strictEqual(r.totalAPagar, 350);
assert.strictEqual(r.totalAPagarVencido, 100);
assert.strictEqual(r.totalAPagar7dias, 50);
assert.deepStrictEqual(r.contasAPagar.map((c) => c.situacao), ['Vencida', 'Vence em breve', 'A vencer']);
assert.strictEqual(r.extratoGeral.length, 2);
assert.strictEqual(r.extratoGeral[0].saldoAcumulado, 700);
console.log('OK: contas a pagar, extrato geral e saldo.');
