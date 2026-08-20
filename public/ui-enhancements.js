'use strict';

const TABLE_SEARCHES = [
  ['tabela-processos', 'Pesquisar por processo, cliente, área ou status'],
  ['tabela-eventos', 'Pesquisar no calendário'],
  ['tabela-clientes', 'Pesquisar clientes'],
  ['tabela-documentos', 'Pesquisar documentos'],
  ['tabela-controladoria', 'Pesquisar exceções da controladoria'],
  ['tabela-tarefas', 'Pesquisar tarefas'],
  ['tabela-publicacoes', 'Pesquisar publicações'],
  ['tabela-contratos', 'Pesquisar contratos'],
];

function normalizarBusca(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

function aplicarFiltroTabela(table, input, counter) {
  const termo = normalizarBusca(input.value);
  const rows = Array.from(table.tBodies[0]?.rows || []);
  let visiveis = 0;

  rows.forEach((row) => {
    const corresponde = !termo || normalizarBusca(row.innerText).includes(termo);
    row.hidden = !corresponde;
    if (corresponde) visiveis += 1;
  });

  counter.textContent = termo
    ? `${visiveis} de ${rows.length} registros`
    : `${rows.length} registros`;
}

function prepararTabela(tableId, placeholder) {
  const table = document.getElementById(tableId);
  if (!table || table.dataset.enhanced === 'true') return;
  table.dataset.enhanced = 'true';

  const scroll = document.createElement('div');
  scroll.className = 'table-scroll';
  table.parentNode.insertBefore(scroll, table);
  scroll.appendChild(table);

  const tools = document.createElement('div');
  tools.className = 'table-tools';

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'table-search';
  input.placeholder = placeholder;
  input.setAttribute('aria-label', placeholder);

  const counter = document.createElement('span');
  counter.className = 'table-count';
  counter.setAttribute('aria-live', 'polite');

  tools.append(input, counter);
  scroll.parentNode.insertBefore(tools, scroll);

  const filtrar = () => aplicarFiltroTabela(table, input, counter);
  input.addEventListener('input', filtrar);
  new MutationObserver(filtrar).observe(table.tBodies[0], { childList: true });
  filtrar();
}

function melhorarBotoes() {
  document.querySelectorAll('button[title]:not([aria-label])').forEach((button) => {
    button.setAttribute('aria-label', button.title);
  });
}

function atualizarNavegacaoAcessivel() {
  document.querySelectorAll('nav .nav-item[data-view]').forEach((button) => {
    if (button.classList.contains('active')) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}

function iniciarMelhorias() {
  TABLE_SEARCHES.forEach(([id, placeholder]) => prepararTabela(id, placeholder));
  melhorarBotoes();
  atualizarNavegacaoAcessivel();

  document.querySelector('nav')?.addEventListener('click', () => {
    requestAnimationFrame(atualizarNavegacaoAcessivel);
  });

  new MutationObserver(melhorarBotoes).observe(document.body, {
    childList: true,
    subtree: true,
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciarMelhorias, { once: true });
} else {
  iniciarMelhorias();
}
