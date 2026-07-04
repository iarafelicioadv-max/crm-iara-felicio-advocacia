const STATUSES = ['Novo', 'Em Andamento', 'Aguardando', 'Concluído'];
const AREAS = ['Cível', 'Trabalhista', 'Família', 'Criminal', 'Tributário', 'Previdenciário', 'Outro'];
const TIPOS_PROCESSO = ['Ação Ordinária', 'CPD', 'Mandado de Segurança', 'Execução', 'Outro'];
const TIPOS_EVENTO = ['Audiência', 'Prazo', 'Reunião', 'Perícia', 'Outro'];
const TIPOS_DOC = ['Petição', 'Procuração', 'Contrato', 'Documento Pessoal', 'Prova', 'Outro'];

let state = { clientes: [], processos: [], eventos: [], documentos: [] };

// ---------- API helpers ----------
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
    ...opts,
  });
  if (!res.ok) throw new Error('Erro na API: ' + res.status);
  return res.json();
}

async function carregarTudo() {
  const [clientes, processos, eventos, documentos, dashboard] = await Promise.all([
    api('/api/clientes'),
    api('/api/processos'),
    api('/api/eventos'),
    api('/api/documentos'),
    api('/api/dashboard'),
  ]);
  state = { clientes, processos, eventos, documentos, dashboard };
  renderAll();
}

function nomeCliente(id) {
  const c = state.clientes.find((x) => x.id === Number(id));
  return c ? c.nome : '—';
}
function nomeProcesso(id) {
  const p = state.processos.find((x) => x.id === Number(id));
  return p ? p.nome : '—';
}
function classStatus(s) {
  return 'status-' + String(s).replace(/\s+/g, '-');
}

// ---------- Navegação ----------
document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('view-' + btn.dataset.view).classList.add('active');
  });
});

// ---------- Render ----------
function renderAll() {
  renderDashboard();
  renderKanban();
  renderProcessos();
  renderEventos();
  renderClientes();
  renderDocumentos();
  renderRelatorios();
}

function renderDashboard() {
  const d = state.dashboard;
  document.getElementById('stat-total').textContent = d.totalProcessos;
  document.getElementById('stat-liminares').textContent = d.liminaresDeferidas;
  document.getElementById('stat-cpds').textContent = d.cpdsAtivos;
  document.getElementById('stat-pendentes').textContent = d.acoesPendentes;

  const tbody = document.querySelector('#tabela-recentes tbody');
  tbody.innerHTML = d.processosRecentes.map((p) => `
    <tr>
      <td>${p.clienteNome}</td>
      <td>${p.nome || '—'}</td>
      <td><span class="badge ${classStatus(p.status)}">${p.status || '—'}</span></td>
      <td>${p.area || '—'}</td>
    </tr>`).join('') || '<tr><td colspan="4">Nenhum processo cadastrado ainda.</td></tr>';
}

function renderKanban() {
  const board = document.getElementById('kanban-board');
  board.innerHTML = STATUSES.map((status) => `
    <div class="kanban-col" data-status="${status}">
      <h4>${status} (${state.processos.filter((p) => p.status === status).length})</h4>
      <div class="kanban-cards" data-status="${status}">
        ${state.processos.filter((p) => p.status === status).map((p) => `
          <div class="kanban-card" draggable="true" data-id="${p.id}">
            <strong>${p.nome || 'Processo #' + p.id}</strong>
            ${nomeCliente(p.clienteId)}<br/>
            <small>${p.area || ''}</small>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  board.querySelectorAll('.kanban-card').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.dataset.id);
    });
  });
  board.querySelectorAll('.kanban-col').forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drag-over'); });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const id = e.dataTransfer.getData('text/plain');
      const novoStatus = col.dataset.status;
      await api(`/api/processos/${id}`, { method: 'PUT', body: JSON.stringify({ status: novoStatus }) });
      await carregarTudo();
    });
  });
}

function renderProcessos() {
  const tbody = document.querySelector('#tabela-processos tbody');
  tbody.innerHTML = state.processos.map((p) => `
    <tr>
      <td>${p.nome || '—'}</td>
      <td>${nomeCliente(p.clienteId)}</td>
      <td>${p.area || '—'}</td>
      <td><span class="badge ${classStatus(p.status)}">${p.status || '—'}</span></td>
      <td>${p.prazo || '—'}</td>
      <td>
        <button class="btn-icon" title="Editar" onclick="abrirModalProcesso(${p.id})">✏️</button>
        <button class="btn-icon" title="Excluir" onclick="excluir('processos', ${p.id})">🗑️</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="6">Nenhum processo cadastrado ainda.</td></tr>';
}

function renderEventos() {
  const tbody = document.querySelector('#tabela-eventos tbody');
  const ordenados = [...state.eventos].sort((a, b) => new Date(a.data) - new Date(b.data));
  tbody.innerHTML = ordenados.map((e) => `
    <tr>
      <td>${e.data ? new Date(e.data).toLocaleDateString('pt-BR') : '—'}</td>
      <td>${e.titulo || '—'}</td>
      <td>${e.tipo || '—'}</td>
      <td>${e.processoId ? nomeProcesso(e.processoId) : '—'}</td>
      <td>
        <button class="btn-icon" title="Editar" onclick="abrirModalEvento(${e.id})">✏️</button>
        <button class="btn-icon" title="Excluir" onclick="excluir('eventos', ${e.id})">🗑️</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="5">Nenhum evento cadastrado ainda.</td></tr>';
}

function renderClientes() {
  const tbody = document.querySelector('#tabela-clientes tbody');
  tbody.innerHTML = state.clientes.map((c) => `
    <tr>
      <td>${c.nome || '—'}</td>
      <td>${c.documento || '—'}</td>
      <td>${c.telefone || '—'}</td>
      <td>${c.email || '—'}</td>
      <td>
        <button class="btn-icon" title="Editar" onclick="abrirModalCliente(${c.id})">✏️</button>
        <button class="btn-icon" title="Excluir" onclick="excluir('clientes', ${c.id})">🗑️</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="5">Nenhum cliente cadastrado ainda.</td></tr>';
}

function renderDocumentos() {
  const tbody = document.querySelector('#tabela-documentos tbody');
  tbody.innerHTML = state.documentos.map((d) => `
    <tr>
      <td>${d.arquivo ? `<a href="${d.arquivo}" target="_blank">${d.nome}</a>` : d.nome}</td>
      <td>${d.tipo || '—'}</td>
      <td>${d.clienteId ? nomeCliente(d.clienteId) : '—'}</td>
      <td>${d.processoId ? nomeProcesso(d.processoId) : '—'}</td>
      <td><button class="btn-icon" title="Excluir" onclick="excluir('documentos', ${d.id})">🗑️</button></td>
    </tr>`).join('') || '<tr><td colspan="5">Nenhum documento cadastrado ainda.</td></tr>';
}

let charts = {};
function renderRelatorios() {
  const porStatus = STATUSES.map((s) => state.processos.filter((p) => p.status === s).length);
  const porArea = AREAS.map((a) => state.processos.filter((p) => p.area === a).length);

  if (charts.status) charts.status.destroy();
  if (charts.area) charts.area.destroy();

  charts.status = new Chart(document.getElementById('chart-status'), {
    type: 'doughnut',
    data: { labels: STATUSES, datasets: [{ data: porStatus, backgroundColor: ['#2b5cd6', '#b8860b', '#c1512e', '#227a3d'] }] },
  });
  charts.area = new Chart(document.getElementById('chart-area'), {
    type: 'bar',
    data: { labels: AREAS, datasets: [{ data: porArea, backgroundColor: '#5c1023' }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } },
  });
}

// ---------- Exclusão ----------
async function excluir(recurso, id) {
  if (!confirm('Confirma exclusão?')) return;
  await api(`/api/${recurso}/${id}`, { method: 'DELETE' });
  await carregarTudo();
}

// ---------- Modais ----------
const overlay = document.getElementById('modal-overlay');
const modalBox = document.getElementById('modal-box');

function fecharModal() {
  overlay.classList.remove('active');
  modalBox.innerHTML = '';
}
overlay.addEventListener('click', (e) => { if (e.target === overlay) fecharModal(); });

function abrirModalCliente(id) {
  const c = id ? state.clientes.find((x) => x.id === id) : {};
  modalBox.innerHTML = `
    <h3>${id ? 'Editar' : 'Novo'} Cliente</h3>
    <label>Nome completo</label><input id="f-nome" value="${c.nome || ''}" />
    <label>CPF/CNPJ</label><input id="f-documento" value="${c.documento || ''}" />
    <label>Telefone</label><input id="f-telefone" value="${c.telefone || ''}" />
    <label>E-mail</label><input id="f-email" value="${c.email || ''}" />
    <label>Endereço</label><input id="f-endereco" value="${c.endereco || ''}" />
    <div class="modal-actions">
      <button class="btn-secondary" onclick="fecharModal()">Cancelar</button>
      <button class="btn-primary" onclick="salvarCliente(${id || 'null'})">Salvar</button>
    </div>`;
  overlay.classList.add('active');
}

async function salvarCliente(id) {
  const body = {
    nome: document.getElementById('f-nome').value,
    documento: document.getElementById('f-documento').value,
    telefone: document.getElementById('f-telefone').value,
    email: document.getElementById('f-email').value,
    endereco: document.getElementById('f-endereco').value,
  };
  if (id) await api(`/api/clientes/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  else await api('/api/clientes', { method: 'POST', body: JSON.stringify(body) });
  fecharModal();
  await carregarTudo();
}

function opcoesClientes(selecionado) {
  return state.clientes.map((c) => `<option value="${c.id}" ${Number(selecionado) === c.id ? 'selected' : ''}>${c.nome}</option>`).join('');
}
function opcoesProcessos(selecionado) {
  return `<option value="">— nenhum —</option>` + state.processos.map((p) => `<option value="${p.id}" ${Number(selecionado) === p.id ? 'selected' : ''}>${p.nome}</option>`).join('');
}
function opcoesLista(lista, selecionado) {
  return lista.map((x) => `<option ${x === selecionado ? 'selected' : ''}>${x}</option>`).join('');
}

function abrirModalProcesso(id) {
  const p = id ? state.processos.find((x) => x.id === id) : {};
  modalBox.innerHTML = `
    <h3>${id ? 'Editar' : 'Novo'} Processo</h3>
    <label>Nome / Número do processo</label><input id="f-nome" value="${p.nome || ''}" />
    <label>Cliente</label><select id="f-cliente">${opcoesClientes(p.clienteId)}</select>
    <label>Área</label><select id="f-area">${opcoesLista(AREAS, p.area)}</select>
    <label>Tipo</label><select id="f-tipo">${opcoesLista(TIPOS_PROCESSO, p.tipo)}</select>
    <label>Status</label><select id="f-status">${opcoesLista(STATUSES, p.status || 'Novo')}</select>
    <label>Prazo</label><input type="date" id="f-prazo" value="${p.prazo || ''}" />
    <label><input type="checkbox" id="f-liminar" ${p.liminarDeferida ? 'checked' : ''} style="width:auto;display:inline-block;"/> Liminar deferida</label>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="fecharModal()">Cancelar</button>
      <button class="btn-primary" onclick="salvarProcesso(${id || 'null'})">Salvar</button>
    </div>`;
  overlay.classList.add('active');
}

async function salvarProcesso(id) {
  const body = {
    nome: document.getElementById('f-nome').value,
    clienteId: Number(document.getElementById('f-cliente').value) || null,
    area: document.getElementById('f-area').value,
    tipo: document.getElementById('f-tipo').value,
    status: document.getElementById('f-status').value,
    prazo: document.getElementById('f-prazo').value,
    liminarDeferida: document.getElementById('f-liminar').checked,
  };
  if (id) await api(`/api/processos/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  else await api('/api/processos', { method: 'POST', body: JSON.stringify(body) });
  fecharModal();
  await carregarTudo();
}

function abrirModalEvento(id) {
  const e = id ? state.eventos.find((x) => x.id === id) : {};
  modalBox.innerHTML = `
    <h3>${id ? 'Editar' : 'Novo'} Evento</h3>
    <label>Título</label><input id="f-titulo" value="${e.titulo || ''}" />
    <label>Data</label><input type="date" id="f-data" value="${e.data || ''}" />
    <label>Tipo</label><select id="f-tipo">${opcoesLista(TIPOS_EVENTO, e.tipo)}</select>
    <label>Processo vinculado</label><select id="f-processo">${opcoesProcessos(e.processoId)}</select>
    <label>Observações</label><textarea id="f-obs" rows="3">${e.observacoes || ''}</textarea>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="fecharModal()">Cancelar</button>
      <button class="btn-primary" onclick="salvarEvento(${id || 'null'})">Salvar</button>
    </div>`;
  overlay.classList.add('active');
}

async function salvarEvento(id) {
  const body = {
    titulo: document.getElementById('f-titulo').value,
    data: document.getElementById('f-data').value,
    tipo: document.getElementById('f-tipo').value,
    processoId: Number(document.getElementById('f-processo').value) || null,
    observacoes: document.getElementById('f-obs').value,
  };
  if (id) await api(`/api/eventos/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  else await api('/api/eventos', { method: 'POST', body: JSON.stringify(body) });
  fecharModal();
  await carregarTudo();
}

function abrirModalDocumento() {
  modalBox.innerHTML = `
    <h3>Novo Documento</h3>
    <label>Nome do documento</label><input id="f-nome" />
    <label>Tipo</label><select id="f-tipo">${opcoesLista(TIPOS_DOC)}</select>
    <label>Cliente</label><select id="f-cliente"><option value="">— nenhum —</option>${opcoesClientes()}</select>
    <label>Processo</label><select id="f-processo">${opcoesProcessos()}</select>
    <label>Arquivo</label><input type="file" id="f-arquivo" />
    <div class="modal-actions">
      <button class="btn-secondary" onclick="fecharModal()">Cancelar</button>
      <button class="btn-primary" onclick="salvarDocumento()">Salvar</button>
    </div>`;
  overlay.classList.add('active');
}

async function salvarDocumento() {
  const fd = new FormData();
  fd.append('nome', document.getElementById('f-nome').value);
  fd.append('tipo', document.getElementById('f-tipo').value);
  fd.append('clienteId', document.getElementById('f-cliente').value);
  fd.append('processoId', document.getElementById('f-processo').value);
  const arquivo = document.getElementById('f-arquivo').files[0];
  if (arquivo) fd.append('arquivo', arquivo);
  await fetch('/api/documentos', { method: 'POST', body: fd });
  fecharModal();
  await carregarTudo();
}

carregarTudo();
