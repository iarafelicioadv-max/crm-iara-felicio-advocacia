const assert = require('assert');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const codigo = fs.readFileSync(path.join(raiz, 'server.js'), 'utf8');
const inicio = codigo.indexOf('function dataHoje()');
const fim = codigo.indexOf("app.get('/api/controladoria'", inicio);
assert(inicio >= 0 && fim > inicio, 'bloco de operações não encontrado');

const carregar = new Function('checklistCompleto', `${codigo.slice(inicio, fim)}; return { calcularControladoria };`);
const checklistCompleto = (_db, cliente) => cliente.id === 1 ? [{ solicitado: true, enviado: false, rotulo: 'Procuração' }] : [];
const { calcularControladoria } = carregar(checklistCompleto);
const { calcularFinanceiro } = require('../financeiro');

const db = {
  clientes: [{ id: 1, nome: 'Cliente Teste' }],
  processos: [{ id: 1, nome: 'Ação previdenciária', numeroProcesso: '5000000-00.2026.8.13.0000', clienteId: 1, area: 'Previdenciário', status: 'Em Andamento' }],
  documentos: [],
  tarefas: [{ id: 1, titulo: 'Protocolar petição', prazo: '2000-01-01', status: 'A fazer' }],
  publicacoes: [{ id: 1, descricao: 'Intimação', dataPublicacao: '2026-08-15', prazoFatal: '2026-08-20', status: 'Nova', processoId: null, tribunal: 'TJMG' }],
  contratos: [{ id: 1, clienteId: 1, descricao: 'Honorários', valorTotal: 3000, proximoVencimento: '2000-01-01', status: 'Ativo' }],
  pagamentos: [{ id: 1, contratoId: 1, data: '2026-08-01', valor: 1000 }, { id: 2, contratoId: null, data: '2026-08-02', valor: 200, descricao: 'Não conciliado' }],
};

const controladoria = calcularControladoria(db);
assert(controladoria.some((i) => i.tipo === 'Prazo' && i.risco === 'Crítico'));
assert(controladoria.some((i) => i.tipo === 'Conciliação' && i.risco === 'Crítico'));
assert(controladoria.some((i) => i.tipo === 'Documentos' && i.risco === 'Alto'));
assert(controladoria.some((i) => i.tipo === 'Financeiro' && /Pagamento sem contrato/.test(i.titulo)));

const financeiro = calcularFinanceiro(db);
assert.strictEqual(financeiro.totalContratado, 3000);
assert.strictEqual(financeiro.totalRecebido, 1200);
assert.strictEqual(financeiro.totalRecebidoConciliado, 1000);
assert.strictEqual(financeiro.aReceber, 2000);
assert.strictEqual(financeiro.vencido, 2000);
assert.strictEqual(financeiro.pagamentosSemContrato.length, 1);

const html = fs.readFileSync(path.join(raiz, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(raiz, 'public', 'app.js'), 'utf8');
['view-controladoria', 'view-financeiro', 'view-leads', 'tabela-tarefas', 'tabela-publicacoes'].forEach((id) => assert(html.includes(`id="${id}"`), `ID ausente: ${id}`));
['renderControladoria()', 'renderFinanceiro()', 'renderRotina()', '/api/tarefas/${id}/concluir'].forEach((trecho) => assert(app.includes(trecho), `fluxo ausente: ${trecho}`));

console.log('OK: recursos anteriores e novos fluxos operacionais validados.');
