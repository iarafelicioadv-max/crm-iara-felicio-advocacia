const STATUSES = ['A confirmar', 'Pendente', 'Em execução', 'Em Andamento', 'Aguardando', 'Aguardando cliente', 'Em recurso', 'Cumprimento', 'Arquivado', 'Sem êxito', 'Novo', 'Concluído'];
const AREAS = ['Cível', 'Trabalhista', 'Família', 'Criminal', 'Tributário', 'Previdenciário', 'Outro'];
const TIPOS_PROCESSO = ['Ação Ordinária', 'CPD', 'Mandado de Segurança', 'Execução', 'Outro'];
const TIPOS_EVENTO = ['Audiência', 'Prazo', 'Reunião', 'Perícia', 'Outro'];
const TIPOS_DOC = ['Petição', 'Procuração', 'Contrato', 'Documento Pessoal', 'Prova', 'Outro'];
const ETAPAS_LEAD = ['1. Prospecção', '2. Qualificação', '3. Reunião Agendada', '4. Proposta Enviada', '5. Negociação', '6. Contrato', '7. Pós-venda'];const STATUS_TAREFA = ['A fazer', 'Em execução', 'Aguardando revisão', 'Concluída'];
const CATEGORIAS_DESPESA = ['Aluguel', 'Água/Luz/Internet', 'Softwares e assinaturas', 'Marketing e conteúdo', 'Salários e pró-labore', 'Contador e impostos', 'Material de escritório', 'Cartório e custas', 'Outro'];

let state = { clientes: [], processos: [], eventos: [], documentos: [], checklistTemplates: [], usuarios: [], leads: [], tarefas: [], publicacoes: [], contratos: [], pagamentos: [], despesas: [], controladoria: { resumo: {}, itens: [] }, financeiro: {}, whatsapp: {}, zapsign: {} };
let usuarioAtual = null;

// ---------- API helpers ----------
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
    ...opts,
  });
  if (res.status === 401) {
    window.location.href = '/login.html';
    throw new Error('não autenticado');
  }
  if (!res.ok) {
    const dados = await res.json().catch(() => ({}));
    throw new Error(dados.erro || 'Erro na API: ' + res.status);
  }
  return res.json();
}

async function carregarTudo() {
  const chamadas = [
    api('/api/clientes'),
    api('/api/processos'),
    api('/api/eventos'),
    api('/api/documentos'),
    api('/api/dashboard'),
    api('/api/checklist-templates'),
    api('/api/leads'),
    api('/api/tarefas'),
    api('/api/publicacoes'),
    api('/api/contratos'),
    api('/api/pagamentos'),
    api('/api/despesas'),
    api('/api/controladoria'),
    api('/api/financeiro'),
    api('/api/whatsapp/status'),
    api('/api/integracoes/zapsign/status'),
  ];
  if (usuarioAtual && usuarioAtual.role === 'admin') chamadas.push(api('/api/usuarios'));
  const resultados = await Promise.all(chamadas);
  const [clientes, processos, eventos, documentos, dashboard, checklistTemplates, leads, tarefas, publicacoes, contratos, pagamentos, despesas, controladoria, financeiro, whatsapp, zapsign] = resultados;
  const usuarios = usuarioAtual && usuarioAtual.role === 'admin' ? resultados[16] : [];
  state = { clientes, processos, eventos, documentos, dashboard, checklistTemplates, leads, tarefas, publicacoes, contratos, pagamentos, despesas, controladoria, financeiro, whatsapp, zapsign, usuarios: usuarios || [] };
  renderAll();
}

async function iniciar() {
  try {
    usuarioAtual = await api('/api/me');
  } catch (e) {
    return;
  }
  document.getElementById('usuario-logado').textContent = usuarioAtual.nome + ' (' + (usuarioAtual.role === 'admin' ? 'administradora' : 'membro') + ')';
  if (usuarioAtual.role === 'admin') document.getElementById('nav-usuarios').style.display = 'block';
  await carregarTudo();
  if (usuarioAtual.precisaTrocarSenha) abrirModalTrocarSenha(true);
}

async function sair() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
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
function moeda(valor) { return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function dataBr(valor) { return valor ? new Date(valor + 'T00:00:00').toLocaleDateString('pt-BR') : '—'; }
function riscoClasse(risco) { return `risco-${String(risco || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()}`; }
function textoSeguro(valor) {
  return String(valor == null ? '' : valor).replace(/[&<>"']/g, (caractere) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[caractere]);
}

// ---------- Navegação ----------
document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item[data-view]').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('view-' + btn.dataset.view).classList.add('active');
    if (btn.dataset.view === 'publicacoes') marcarPublicacoesDjenVistas();
  });
});
async function marcarPublicacoesDjenVistas() {
  const badge = document.getElementById('badge-publicacoes-djen');
  if (!badge || badge.style.display === 'none') return;
  await api('/api/publicacoes/marcar-vistas', { method: 'POST' });
  badge.style.display = 'none';
}

// ---------- Render ----------
function renderAll() {
  renderDashboard();
  renderKanban();
  renderProcessos();
  renderEventos();
  renderClientes();
  renderDocumentos();
  renderLeads();
  renderTarefas();
  renderPublicacoes();
  renderControladoria();
  renderFinanceiro();
  renderRelatorios();
  renderRotina();
  if (usuarioAtual && usuarioAtual.role === 'admin') renderUsuarios();
}

function renderDashboard() {
  const d = state.dashboard;
  document.getElementById('stat-total').textContent = d.totalProcessos;
  document.getElementById('stat-liminares').textContent = d.excecoesCriticas || 0;
  document.getElementById('stat-prazos').textContent = d.prazosSemana;
  document.getElementById('stat-pendentes').textContent = moeda(d.financeiroVencido || 0);

  const tbody = document.querySelector('#tabela-recentes tbody');
  tbody.innerHTML = d.processosRecentes.map((p) => `
    <tr>
      <td>${p.clienteNome}</td>
      <td>${p.nome || '—'}</td>
      <td><span class="badge ${classStatus(p.status)}">${p.status || '—'}</span></td>
      <td>${p.area || '—'}</td>
    </tr>`).join('') || '<tr><td colspan="4">Nenhum processo cadastrado ainda.</td></tr>';

  renderDocumentosNovos(d.documentosNovos || []);
  const alertas = document.getElementById('alertas-dashboard');
  if (alertas) alertas.innerHTML = [
    ...(d.tarefasVencidas || []).map((t) => `<div class="alerta"><strong>Prazo vencido:</strong> ${t.titulo} — ${dataBr(t.prazo)}</div>`),
    ...(d.publicacoesNovas || []).map((p) => `<div class="alerta"><strong>Publicação não tratada:</strong> ${p.descricao}</div>`),
  ].join('');

  const painelPrazos = document.getElementById('painel-proximos-prazos');
  const listaPrazos = document.getElementById('proximos-prazos-lista');
  const itensPrazos = [
    ...(d.tarefasHoje || []).map((t) => ({ ...t, tag: 'Hoje', classe: 'hoje' })),
    ...(d.tarefasAmanha || []).map((t) => ({ ...t, tag: 'Amanhã', classe: 'amanha' })),
  ];
  if (painelPrazos && listaPrazos) {
    if (!itensPrazos.length) {
      painelPrazos.style.display = 'none';
    } else {
      painelPrazos.style.display = 'block';
      listaPrazos.innerHTML = itensPrazos.map((t) => `<div class="tarefa-resumo" onclick="editarTarefa(${t.id})"><span><strong>${t.titulo}</strong>${t.processoId ? ` · ${nomeProcesso(t.processoId)}` : ''}</span><span class="tarefa-resumo-tag ${t.classe}">${t.tag}${t.prioridade ? ` · ${t.prioridade}` : ''}</span></div>`).join('');
    }
  }

  const badgeDjen = document.getElementById('badge-publicacoes-djen');
  if (badgeDjen) {
    const naoVistas = d.publicacoesDjenNaoVistas || 0;
    badgeDjen.style.display = naoVistas ? 'inline-block' : 'none';
    badgeDjen.textContent = naoVistas;
  }
}

function renderDocumentosNovos(lista) {
  const painel = document.getElementById('painel-documentos-novos');
  const badge = document.getElementById('badge-documentos-novos');
  const container = document.getElementById('lista-documentos-novos');

  if (!lista.length) {
    painel.style.display = 'none';
    badge.style.display = 'none';
    return;
  }

  painel.style.display = 'block';
  badge.style.display = 'inline-block';
  badge.textContent = lista.length;

  container.innerHTML = lista.map((doc) => `
    <div class="checklist-item">
      <div class="checklist-item-topo">
        <strong>${doc.clienteNome} — ${doc.nome}</strong>
        <span class="checklist-badge ok">Novo</span>
      </div>
      <small>${doc.nomeOriginal} — <a href="${doc.arquivo}" target="_blank" onclick="marcarDocumentoVisto(${doc.id})">abrir</a> · recebido em ${new Date(doc.criadoEm).toLocaleString('pt-BR')}</small>
      <div style="margin-top:8px;">
        <button class="btn-secondary" onclick="marcarDocumentoVisto(${doc.id})">Marcar como visto</button>
      </div>
    </div>
  `).join('');
}

async function marcarDocumentoVisto(id) {
  await api(`/api/documentos/${id}/marcar-visto`, { method: 'POST' });
  const d = await api('/api/dashboard');
  state.dashboard = d;
  renderDocumentosNovos(d.documentosNovos || []);
}

async function marcarTodosDocumentosVistos() {
  await api('/api/documentos/marcar-todos-vistos', { method: 'POST' });
  const d = await api('/api/dashboard');
  state.dashboard = d;
  renderDocumentosNovos(d.documentosNovos || []);
}

const STATUS_ENCERRADOS = ['Arquivado', 'Sem êxito', 'Concluído'];
const COR_STATUS = { 'A confirmar': '#8a7f78', 'Pendente': '#b8860b', 'Em execução': '#0e7490', 'Em Andamento': '#2b5cd6', 'Aguardando': '#c1512e', 'Aguardando cliente': '#d97706', 'Em recurso': '#7c3aed', 'Cumprimento': '#0f766e', 'Novo': '#2b5cd6', 'Arquivado': '#6b7280', 'Sem êxito': '#6b7280', 'Concluído': '#227a3d' };

const STATUS_ANTIGOS = { 'Triagem': 'A confirmar', 'Pré-contencioso': 'Pendente' };
function statusKanban(p) { return STATUSES.includes(p.status) ? p.status : (STATUS_ANTIGOS[p.status] || 'A confirmar'); }
function hojeISO() { return new Date().toISOString().slice(0, 10); }
function diasAte(dataISO) {
  if (!dataISO) return null;
  return Math.round((new Date(dataISO + 'T00:00:00') - new Date(hojeISO() + 'T00:00:00')) / 86400000);
}
// Próximo compromisso do processo: prazo do processo, tarefas abertas e eventos futuros ligados a ele.
function proximoPrazoProcesso(p) {
  const hoje = hojeISO();
  const itens = [];
  if (p.prazo) itens.push({ data: p.prazo, rotulo: 'Prazo do processo' });
  state.tarefas.filter((t) => t.processoId === p.id && t.status !== 'Concluída' && t.prazo)
    .forEach((t) => itens.push({ data: t.prazo, rotulo: `${t.tipoPrazo === 'Fatal' ? 'Prazo fatal' : 'Tarefa'}: ${t.titulo}` }));
  state.eventos.filter((e) => e.processoId === p.id && e.data && e.data >= hoje && ['Prazo', 'Audiência', 'Perícia'].includes(e.tipo))
    .forEach((e) => itens.push({ data: e.data, rotulo: `${e.tipo}: ${e.titulo}` }));
  if (!itens.length) return null;
  itens.sort((x, y) => x.data.localeCompare(y.data));
  return { ...itens[0], dias: diasAte(itens[0].data) };
}
function textoPrazo(dias) {
  if (dias === null) return '';
  if (dias < 0) return `venceu há ${-dias} dia${dias === -1 ? '' : 's'}`;
  if (dias === 0) return 'vence hoje';
  if (dias === 1) return 'vence amanhã';
  return `em ${dias} dias`;
}
function classeUrgencia(dias) {
  if (dias === null) return 'sem';
  if (dias < 0) return 'atrasado';
  if (dias <= 3) return 'urgente';
  if (dias <= 7) return 'semana';
  return 'ok';
}

function renderKanban() {
  const board = document.getElementById('kanban-board');
  const selArea = document.getElementById('kb-area');
  if (selArea.options.length <= 1) selArea.innerHTML = '<option value="">Todas as áreas</option>' + AREAS.map((a) => `<option>${a}</option>`).join('');
  const busca = document.getElementById('kb-busca').value.trim().toLocaleLowerCase('pt-BR');
  const area = selArea.value;
  const urg = document.getElementById('kb-urgencia').value;
  const mostrarEncerrados = document.getElementById('kb-arquivados').checked;

  const todos = state.processos.map((p) => ({ p, prox: proximoPrazoProcesso(p) }));
  const filtrados = todos.filter(({ p, prox }) => {
    if (area && p.area !== area) return false;
    if (busca && !`${p.nome || ''} ${nomeCliente(p.clienteId)} ${p.numeroProcesso || ''}`.toLocaleLowerCase('pt-BR').includes(busca)) return false;
    if (urg === 'atrasado' && !(prox && prox.dias < 0)) return false;
    if (urg === 'semana' && !(prox && prox.dias >= 0 && prox.dias <= 7)) return false;
    if (urg === 'sem' && prox) return false;
    return true;
  });

  const ativos = todos.filter(({ p }) => !STATUS_ENCERRADOS.includes(statusKanban(p)));
  const nAtrasados = ativos.filter(({ prox }) => prox && prox.dias < 0).length;
  const nSemana = ativos.filter(({ prox }) => prox && prox.dias >= 0 && prox.dias <= 7).length;
  const nSem = ativos.filter(({ prox }) => !prox).length;
  document.getElementById('kanban-resumo').innerHTML =
    `<span class="kb-chip kb-atrasado" onclick="filtrarKanban('atrasado')"><strong>${nAtrasados}</strong> com prazo vencido</span>` +
    `<span class="kb-chip kb-semana" onclick="filtrarKanban('semana')"><strong>${nSemana}</strong> vencem em até 7 dias</span>` +
    `<span class="kb-chip kb-sem" onclick="filtrarKanban('sem')"><strong>${nSem}</strong> sem prazo definido</span>` +
    `<span class="kb-chip" onclick="filtrarKanban('')"><strong>${ativos.length}</strong> processos em andamento</span>`;

  const colunas = STATUSES.filter((s) => mostrarEncerrados || !STATUS_ENCERRADOS.includes(s));
  board.innerHTML = colunas.map((status) => {
    const cartoes = filtrados.filter(({ p }) => statusKanban(p) === status)
      .sort((a, b) => (a.prox ? a.prox.data : '9999').localeCompare(b.prox ? b.prox.data : '9999'));
    const atrasadosCol = cartoes.filter(({ prox }) => prox && prox.dias < 0).length;
    const vazia = !cartoes.length;
    return `
    <div class="kanban-col ${vazia ? 'vazia' : ''}" data-status="${status}" style="border-top:4px solid ${COR_STATUS[status] || '#8a7f78'}">
      <h4>${status} <span class="kb-count">${cartoes.length}</span>${atrasadosCol ? `<span class="kb-count kb-count-alerta" title="com prazo vencido">${atrasadosCol} ⚠</span>` : ''}</h4>
      <div class="kanban-cards" data-status="${status}">
        ${cartoes.map(({ p, prox }) => {
          const nTarefas = state.tarefas.filter((t) => t.processoId === p.id && t.status !== 'Concluída').length;
          const cls = prox ? classeUrgencia(prox.dias) : 'sem';
          return `
          <div class="kanban-card urg-${cls}" draggable="true" data-id="${p.id}" onclick="abrirModalProcesso(${p.id})">
            <strong>${textoSeguro(p.nome || 'Processo #' + p.id)}</strong>
            <div class="kb-cliente">${textoSeguro(nomeCliente(p.clienteId))}</div>
            ${p.numeroProcesso ? `<div class="kb-cnj">${textoSeguro(p.numeroProcesso)}</div>` : ''}
            <div class="kb-tags">${p.area ? `<span class="kb-tag">${textoSeguro(p.area)}</span>` : ''}${p.liminarDeferida ? '<span class="kb-tag kb-tag-ok">Liminar deferida</span>' : ''}${nTarefas ? `<span class="kb-tag">${nTarefas} tarefa${nTarefas > 1 ? 's' : ''} aberta${nTarefas > 1 ? 's' : ''}</span>` : ''}</div>
            ${prox ? `<div class="kb-prazo kb-prazo-${cls}" title="${textoSeguro(prox.rotulo)}">📅 ${dataBr(prox.data)} · ${textoPrazo(prox.dias)}<br><small>${textoSeguro(prox.rotulo)}</small></div>` : '<div class="kb-prazo kb-prazo-sem">Sem prazo definido</div>'}
            <div class="kb-acoes" onclick="event.stopPropagation()">
              <select onchange="moverProcesso(${p.id}, this.value)" aria-label="Mover para"><option value="">Mover para…</option>${STATUSES.filter((s) => s !== statusKanban(p)).map((s) => `<option>${s}</option>`).join('')}</select>
              <button class="btn-secondary btn-small" onclick="abrirModalTarefa(${p.id})">+ Tarefa</button>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');

  board.querySelectorAll('.kanban-card').forEach((card) => {
    card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', card.dataset.id); card.classList.add('arrastando'); });
    card.addEventListener('dragend', () => card.classList.remove('arrastando'));
  });
  board.querySelectorAll('.kanban-col').forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drag-over'); });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('drag-over');
      await moverProcesso(e.dataTransfer.getData('text/plain'), col.dataset.status);
    });
  });
}
function filtrarKanban(valor) {
  document.getElementById('kb-urgencia').value = valor;
  renderKanban();
}
async function moverProcesso(id, novoStatus) {
  if (!novoStatus) return;
  const p = state.processos.find((x) => x.id === Number(id));
  if (p && statusKanban(p) === novoStatus) return;
  await api(`/api/processos/${id}`, { method: 'PUT', body: JSON.stringify({ status: novoStatus }) });
  await carregarTudo();
}

function renderProcessos() {
  const tbody = document.querySelector('#tabela-processos tbody');
  tbody.innerHTML = state.processos.map((p) => `
    <tr>
      <td>${p.nome || '—'}${p.numeroProcesso ? '<br><small style="color:var(--text-light)">' + p.numeroProcesso + '</small>' : ''}</td>
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
      <td>${e.data ? new Date(e.data + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
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
      <td>${c.driveFolderUrl ? `<a href="${c.driveFolderUrl}" target="_blank" rel="noopener">Abrir pasta</a>` : `<span class="card-label" title="${textoSeguro(c.driveSyncErro || '')}">${textoSeguro(c.driveSyncStatus || 'Pendente')}</span>`}</td>
      <td>
        <button class="btn-icon" title="Editar" onclick="abrirModalCliente(${c.id})">✏️</button>
        <button class="btn-icon" title="Preencher e enviar procuração" onclick="abrirModalProcuracao(${c.id})">🖋️</button>
        <button class="btn-icon" title="Solicitar documentos" onclick="solicitarDocumentosCliente(${c.id})">🔗</button>
        <button class="btn-icon" title="Criar ou sincronizar pasta no Drive" onclick="sincronizarDriveCliente(${c.id})">☁️</button>
        <button class="btn-icon" title="Excluir" onclick="excluir('clientes', ${c.id})">🗑️</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="6">Nenhum cliente cadastrado ainda.</td></tr>';
}

function renderDocumentos() {
  const tbody = document.querySelector('#tabela-documentos tbody');
  tbody.innerHTML = state.documentos.map((d) => `
    <tr>
      <td>${d.arquivo ? `<a href="${d.arquivo}" target="_blank">${d.nome}</a>` : d.nome}</td>
      <td>${d.tipo || '—'}</td>
      <td>${d.clienteId ? nomeCliente(d.clienteId) : '—'}</td>
      <td>${d.processoId ? nomeProcesso(d.processoId) : '—'}</td>
      <td>${d.driveFileUrl ? `<a href="${d.driveFileUrl}" target="_blank" rel="noopener">Abrir no Drive</a>` : `<span class="card-label" title="${textoSeguro(d.driveSyncErro || '')}">${textoSeguro(d.driveSyncStatus || 'Pendente')}</span>`}</td>
      <td>${d.tipo === 'Procuração' ? `<span class="badge ${d.zapsignStatus === 'Assinado' ? 'risco-baixo' : 'risco-medio'}">${textoSeguro(d.zapsignStatus || d.statusAssinatura || 'Gerada')}</span>${d.zapsignSignUrl ? ` <button class="btn-secondary btn-small" onclick="copiarLinkAssinatura('${textoSeguro(d.zapsignSignUrl)}')">Copiar link</button>` : ''}` : '—'}</td>
      <td>${d.tipo === 'Procuração' && !d.zapsignToken ? `<button class="btn-secondary btn-small" onclick="enviarProcuracaoZapSign(${d.id})">Enviar ZapSign</button>` : ''}<button class="btn-icon" title="Excluir" onclick="excluir('documentos', ${d.id})">🗑️</button></td>
    </tr>`).join('') || '<tr><td colspan="7">Nenhum documento cadastrado ainda.</td></tr>';
}

function copiarLinkAssinatura(link) {
  navigator.clipboard.writeText(link)
    .then(() => alert('Link de assinatura copiado.'))
    .catch(() => window.open(link, '_blank', 'noopener'));
}

async function enviarProcuracaoZapSign(id) {
  try {
    const resultado = await api(`/api/documentos/${id}/procuracao/enviar-zapsign`, { method: 'POST' });
    await carregarTudo();
    if (resultado.zapsign?.signUrl) copiarLinkAssinatura(resultado.zapsign.signUrl);
    else alert('Procuração enviada à ZapSign.');
  } catch (erro) { alert(erro.message); }
}

async function sincronizarDriveCliente(id) {
  try {
    const resultado = await api(`/api/clientes/${id}/drive/sincronizar`, { method: 'POST' });
    await carregarTudo();
    alert(`Pasta sincronizada. ${resultado.documentosSincronizados || 0} documento(s) enviado(s) ao Drive.`);
  } catch (erro) {
    alert(erro.message);
  }
}

// ---------- Rotina Documental ----------
// O link de envio de documentos é por CLIENTE (não por processo), pois o processo só é
// criado depois que toda a documentação for reunida.
function renderRotina() {
  const select = document.getElementById('rotina-select-cliente');
  if (!select) return;
  const selecionadoAntes = select.value;
  select.innerHTML = '<option value="">— selecione um cliente —</option>' +
    state.clientes.map((c) => `<option value="${c.id}">${c.nome}</option>`).join('');
  if (selecionadoAntes && state.clientes.some((c) => String(c.id) === selecionadoAntes)) {
    select.value = selecionadoAntes;
    carregarRotinaCliente();
  }
}

function irParaView(nome) {
  document.querySelectorAll('.nav-item[data-view]').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  const btn = document.querySelector(`.nav-item[data-view="${nome}"]`);
  if (btn) btn.classList.add('active');
  document.getElementById('view-' + nome).classList.add('active');
  if (nome === 'publicacoes') marcarPublicacoesDjenVistas();
}

function solicitarDocumentosCliente(id) {
  irParaView('rotina');
  const select = document.getElementById('rotina-select-cliente');
  select.value = id;
  carregarRotinaCliente();
}

const ORDEM_CATEGORIAS = ['Genérico', 'Direito da Saúde', 'FGTS, Previdenciário e Trabalhista', 'Ludopatia, Bancário e Família'];

function categoriasAgrupadas() {
  const grupos = {};
  state.checklistTemplates.forEach((t) => {
    if (!grupos[t.categoria]) grupos[t.categoria] = [];
    grupos[t.categoria].push(t);
  });
  return ORDEM_CATEGORIAS.filter((c) => grupos[c]).map((c) => ({ categoria: c, templates: grupos[c] }));
}

async function carregarRotinaCliente() {
  const id = document.getElementById('rotina-select-cliente').value;
  const container = document.getElementById('rotina-conteudo');
  if (!id) { container.innerHTML = ''; return; }
  const dados = await api(`/api/clientes/${id}/rotina`);
  const link = dados.cliente.uploadToken ? window.location.origin + '/enviar-documentos/' + dados.cliente.uploadToken : null;
  const tiposAtivos = new Set(dados.cliente.tiposCaso || ['GEN']);

  container.innerHTML = `
    <div class="link-envio-box">
      ${link
        ? `<input type="text" readonly value="${link}" onclick="this.select()" /><button class="btn-secondary" onclick="copiarLinkRotina('${link}')">Copiar link</button>`
        : '<span>Nenhum link gerado ainda para este cliente.</span>'}
      <button class="btn-primary" onclick="gerarLinkRotina(${id})">${link ? 'Gerar novo link' : 'Gerar link para o cliente'}</button>
    </div>

    <div class="panel">
      <div class="view-header">
        <h3 style="margin:0;">Tipo(s) de caso — ${dados.cliente.nome}</h3>
        <button class="btn-primary" onclick="salvarTiposCaso(${id})">Aplicar tipo(s) de caso</button>
      </div>
      <div class="notice">Escolha 1 ou mais tipos de caso. O checklist de documentos e a orientação de relato do cliente são montados automaticamente a partir daqui. Combine mais de um quando o caso reunir vários temas (ex: cirurgia + OPME + reembolso).</div>
      <div class="tipo-caso-selector">
        ${categoriasAgrupadas().map((grupo) => `
          <div class="tipo-caso-categoria">
            <h4>${grupo.categoria}</h4>
            ${grupo.templates.map((t) => `
              <label class="tipo-caso-item">
                <input type="checkbox" class="chk-tipo-caso" value="${t.id}" ${tiposAtivos.has(t.id) ? 'checked' : ''} />
                <span>${t.titulo} <small>(${t.quantidadeItens} itens${t.temOrientacao ? ' · com orientação de relato' : ''})</small></span>
              </label>
            `).join('')}
          </div>
        `).join('')}
      </div>
    </div>

    <div class="panel">
      <div class="view-header">
        <h3 style="margin:0;">Checklist — ${dados.cliente.nome}</h3>
        <button class="btn-secondary" onclick="salvarDocumentosSolicitados(${id})">Salvar seleção de documentos</button>
      </div>
      <div class="notice">Marque quais documentos devem ser pedidos a este cliente pelo link. Os desmarcados não aparecem para ele — nem entram na lista de pendências.</div>
      ${agruparChecklistPorTemplate(dados.checklist)}
    </div>
  `;
}

function agruparChecklistPorTemplate(checklist) {
  const grupos = [];
  let atual = null;
  checklist.forEach((item) => {
    if (!atual || atual.templateId !== item.templateId) {
      atual = { templateId: item.templateId, templateTitulo: item.templateTitulo, itens: [] };
      grupos.push(atual);
    }
    atual.itens.push(item);
  });
  if (!grupos.length) return '<p class="notice">Nenhum tipo de caso selecionado ainda.</p>';
  return grupos.map((g) => `
    <div class="checklist-template-grupo">
      <h4 class="checklist-template-titulo">${g.templateTitulo}</h4>
      ${g.itens.map((item) => `
        <div class="checklist-item ${item.enviado ? 'enviado' : ''} ${item.solicitado ? '' : 'nao-solicitado'}">
          <div class="checklist-item-topo">
            <label style="display:flex;align-items:center;gap:8px;margin:0;">
              <input type="checkbox" class="chk-solicitado" data-codigo="${item.codigo}" ${item.solicitado ? 'checked' : ''} style="width:auto;" />
              <strong>${item.rotulo}</strong>
            </label>
            <span class="checklist-badge ${item.enviado ? 'ok' : 'pendente'}">${item.enviado ? 'Recebido' : (item.solicitado ? 'Pendente' : 'Não solicitado')}</span>
          </div>
          ${item.enviado ? `<small>${item.nomeOriginal} — <a href="${item.arquivo}" target="_blank">abrir</a></small>` : ''}
        </div>
      `).join('')}
    </div>
  `).join('');
}

async function salvarTiposCaso(id) {
  const tipos = [...document.querySelectorAll('.chk-tipo-caso:checked')].map((el) => el.value);
  await api(`/api/clientes/${id}/tipos-caso`, { method: 'PUT', body: JSON.stringify({ tipos }) });
  await carregarRotinaCliente();
}

async function salvarDocumentosSolicitados(id) {
  const codigos = [...document.querySelectorAll('.chk-solicitado:checked')].map((el) => el.dataset.codigo);
  await api(`/api/clientes/${id}/documentos-solicitados`, { method: 'PUT', body: JSON.stringify({ codigos }) });
  await carregarRotinaCliente();
}

async function gerarLinkRotina(id) {
  await api(`/api/clientes/${id}/link-envio`, { method: 'POST' });
  await carregarRotinaCliente();
}

function copiarLinkRotina(link) {
  navigator.clipboard.writeText(link).then(() => alert('Link copiado! Envie para o cliente por WhatsApp ou e-mail.'));
}

function renderLeads() {
  const board = document.getElementById('leads-board');
  if (!board) return;
  const status = document.getElementById('whatsapp-status');
  if (status) {
    status.className = `whatsapp-status ${state.whatsapp.conectado ? 'conectado' : 'pendente'}`;
    status.innerHTML = state.whatsapp.conectado
      ? `<strong>Recebimento conectado à Meta</strong><span>${state.whatsapp.ultimaEntrada ? `Última mensagem recebida em ${new Date(state.whatsapp.ultimaEntrada).toLocaleString('pt-BR')}.` : 'Receptor ativo; aguardando a primeira mensagem.'} ${state.whatsapp.envioConfigurado ? 'Respostas pelo CRM liberadas.' : 'O envio será liberado após o cadastro do novo número.'}</span>`
      : (state.whatsapp.configurado
        ? '<strong>WhatsApp configurado</strong><span>Aguardando a primeira confirmação assinada enviada pela Meta.</span>'
        : '<strong>Receptor instalado no CRM</strong><span>Falta concluir a vinculação no painel da Meta e cadastrar os dois segredos na Render.</span>');
  }
  board.innerHTML = ETAPAS_LEAD.map((etapa) => `<div class="kanban-col"><h4>${etapa} (${state.leads.filter((l) => l.etapa === etapa).length})</h4><div class="kanban-cards">${state.leads.filter((l) => l.etapa === etapa).map((l) => {
    const telefone = telefoneWhatsApp(l.telefone);
    const naoLidas = Number(l.naoLidas || 0);
    return `<div class="kanban-card"><div class="lead-card-topo"><strong>${textoSeguro(l.nome)}</strong>${naoLidas ? `<span class="lead-unread">${naoLidas}</span>` : ''}</div>${l.ultimaMensagem ? `<div class="lead-preview">${textoSeguro(l.ultimaMensagem)}</div>` : ''}${telefone ? `<a href="https://wa.me/${telefone}" target="_blank" rel="noopener">Abrir WhatsApp</a><br>` : ''}<small>${textoSeguro(l.origem || 'Contato direto')}</small><div class="lead-actions">${Array.isArray(l.interacoes) && l.interacoes.length ? `<button class="btn-icon" onclick="abrirHistoricoLead(${l.id})">Histórico</button>` : ''}<button class="btn-icon" onclick="moverLead(${l.id})">Avançar</button></div></div>`;
  }).join('') || '<span class="card-label">Sem leads</span>'}</div></div>`).join('');
}

function telefoneWhatsApp(valor) {
  const digitos = String(valor || '').replace(/\D/g, '');
  if (!digitos) return '';
  return digitos.startsWith('55') && digitos.length >= 12 ? digitos : `55${digitos}`;
}

function abrirHistoricoLead(id) {
  const lead = state.leads.find((item) => item.id === id);
  if (!lead) return;
  const interacoes = [...(lead.interacoes || [])].sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)));
  const compositor = state.whatsapp.envioConfigurado
    ? `<div class="conversation-composer"><label for="resposta-whatsapp">Responder pelo WhatsApp</label><textarea id="resposta-whatsapp" maxlength="4096" rows="3" placeholder="Digite sua mensagem"></textarea><div class="composer-footer"><small>Respostas fora da janela de atendimento podem exigir um modelo aprovado pela Meta.</small><button class="btn-primary" id="btn-enviar-whatsapp" onclick="enviarRespostaWhatsApp(${lead.id})">Enviar</button></div></div>`
    : '<div class="conversation-disabled">O recebimento está pronto. O envio será liberado amanhã, depois que o novo número e o token da Meta forem cadastrados.</div>';
  modalBox.innerHTML = `<h3>Conversas — ${textoSeguro(lead.nome)}</h3><div class="conversation-list">${interacoes.map((item) => `<div class="conversation-item ${item.direcao === 'saida' ? 'saida' : 'entrada'}"><div>${textoSeguro(item.texto || `[${item.tipo || 'mensagem'}]`)}</div><small>${item.criadoEm ? new Date(item.criadoEm).toLocaleString('pt-BR') : ''}${item.status ? ` · ${textoSeguro(item.status)}` : ''}</small></div>`).join('') || '<p>Nenhuma conversa registrada.</p>'}</div>${compositor}<div class="modal-actions"><button class="btn-secondary" onclick="fecharModal()">Fechar</button>${Number(lead.naoLidas || 0) ? `<button class="btn-primary" onclick="marcarLeadComoLido(${lead.id})">Marcar como lidas</button>` : ''}</div>`;
  overlay.classList.add('active');
  const lista = modalBox.querySelector('.conversation-list');
  if (lista) lista.scrollTop = lista.scrollHeight;
}

async function enviarRespostaWhatsApp(id) {
  const campo = document.getElementById('resposta-whatsapp');
  const botao = document.getElementById('btn-enviar-whatsapp');
  const texto = String(campo ? campo.value : '').trim();
  if (!texto) return alert('Digite a mensagem antes de enviar.');
  if (botao) botao.disabled = true;
  try {
    await api(`/api/leads/${id}/whatsapp/mensagens`, { method: 'POST', body: JSON.stringify({ texto }) });
    await carregarTudo();
    abrirHistoricoLead(id);
  } catch (erro) {
    alert(erro.message);
    if (botao) botao.disabled = false;
  }
}

async function marcarLeadComoLido(id) {
  await api(`/api/leads/${id}/marcar-lidas`, { method: 'POST' });
  fecharModal();
  await carregarTudo();
}

function renderTarefas() {
  const tbody = document.querySelector('#tabela-tarefas tbody');
  if (!tbody) return;
  tbody.innerHTML = [...state.tarefas].sort((a, b) => String(a.prazo || '9999').localeCompare(String(b.prazo || '9999'))).map((t) => {
    const aguardando = t.status === 'Aguardando revisão';
    const concluida = t.status === 'Concluída';
    const acao = aguardando ? `<button class="btn-primary btn-small" onclick="revisarTarefa(${t.id})">Revisar</button>` : (!concluida ? `<button class="btn-primary btn-small" onclick="concluirTarefa(${t.id})">Concluir</button>` : '✓');
    return `<tr><td>${t.titulo}</td><td>${t.processoId ? nomeProcesso(t.processoId) : '—'}</td><td>${dataBr(t.prazo)} ${t.tipoPrazo === 'Fatal' ? '<span class="badge status-Aguardando">fatal</span>' : ''}</td><td>${t.prioridade || 'Média'}</td><td>${t.status || 'A fazer'}</td><td>${t.evidencia || '—'}</td><td>${acao} <button class="btn-secondary btn-small" onclick="editarTarefa(${t.id})">Editar</button><button class="btn-icon" onclick="excluir('tarefas', ${t.id})">🗑️</button></td></tr>`;
  }).join('') || '<tr><td colspan="7">Nenhuma tarefa cadastrada.</td></tr>';
}

function renderPublicacoes() {
  const tbody = document.querySelector('#tabela-publicacoes tbody');
  if (!tbody) return;
  tbody.innerHTML = state.publicacoes.map((p) => `<tr><td>${dataBr(p.dataPublicacao)}</td><td>${p.processoId ? nomeProcesso(p.processoId) : `<span class="badge risco-critico">Não conciliado${p.numeroProcesso ? ` · ${p.numeroProcesso}` : ''}</span>`}</td><td>${p.origem === 'DJEN' ? '<span class="badge risco-baixo">DJEN</span> ' : ''}${p.descricao}${p.link ? ` <a href="${p.link}" target="_blank" rel="noopener">(ver publicação)</a>` : ''}</td><td>${dataBr(p.prazoFatal)}</td><td>${p.status}</td><td>${p.status === 'Nova' && p.processoId ? `<button class="btn-primary btn-small" onclick="criarTarefaPublicacao(${p.id})">Criar tarefa</button>` : (p.status === 'Nova' ? 'Vincule o processo' : '✓')} <button class="btn-secondary btn-small" onclick="excluir('publicacoes', ${p.id})">Excluir</button></td></tr>`).join('') || '<tr><td colspan="6">Nenhuma publicação registrada.</td></tr>';
}

function renderControladoria() {
  const dados = state.controladoria || { resumo: {}, itens: [] };
  const resumo = dados.resumo || {};
  document.getElementById('ctrl-total').textContent = resumo.total || 0;
  document.getElementById('ctrl-criticos').textContent = resumo.criticos || 0;
  document.getElementById('ctrl-altos').textContent = resumo.altos || 0;
  document.getElementById('ctrl-medios').textContent = resumo.medios || 0;
  document.querySelector('#tabela-controladoria tbody').innerHTML = (dados.itens || []).map((i) => `<tr><td><span class="badge ${riscoClasse(i.risco)}">${i.risco}</span></td><td>${i.tipo}</td><td><strong>${i.titulo}</strong></td><td><small>${i.fonte}</small><br>${i.evidencia}</td><td>${i.acao}</td><td>${i.confianca}</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty-success">Nenhuma exceção encontrada na conferência atual.</div></td></tr>';
}

function renderFinanceiro() {
  const f = state.financeiro || {};
  const z = state.zapsign || {};
  document.getElementById('fin-recebido').textContent = moeda(f.totalRecebido);
  document.getElementById('fin-receber').textContent = moeda(f.aReceber);
  document.getElementById('fin-apagar').textContent = moeda(f.totalAPagar);
  document.getElementById('fin-30').textContent = moeda(f.projecao30);
  document.getElementById('fin-60').textContent = moeda(f.projecao60);
  document.getElementById('fin-90').textContent = moeda(f.projecao90);
  const statusZap = document.getElementById('zapsign-status');
  statusZap.className = `integration-status ${z.webhookConfigurado && z.apiConfigurada ? 'ativo' : 'pendente'}`;
  statusZap.innerHTML = z.webhookConfigurado && z.apiConfigurada
    ? `<strong>ZapSign conectada</strong><span>Assinaturas e mudanças de status são sincronizadas automaticamente.${z.ultimoWebhookEm ? ` Último evento: ${new Date(z.ultimoWebhookEm).toLocaleString('pt-BR')}.` : ''}</span>`
    : `<strong>ZapSign preparada</strong><span>Os contratos já aceitam o documento assinado e o identificador da ZapSign. Falta ativar ${!z.apiConfigurada ? 'o token da API' : ''}${!z.apiConfigurada && !z.webhookConfigurado ? ' e ' : ''}${!z.webhookConfigurado ? 'o webhook seguro' : ''}.</span>`;
  document.querySelector('#tabela-contratos tbody').innerHTML = (f.contratos || []).map((c) => {
    const situacao = c.vencido ? 'Vencido' : (c.saldo ? 'Em aberto' : 'Quitado');
    const assinatura = c.zapsignStatus || c.statusAssinatura || 'Não vinculada';
    const links = [c.documentoDriveUrl ? `<a href="${c.documentoDriveUrl}" target="_blank" rel="noopener">Drive</a>` : '', c.zapsignToken ? '<span class="badge risco-baixo">ZapSign</span>' : ''].filter(Boolean).join(' ');
    return `<tr><td>${nomeCliente(c.clienteId)}</td><td><strong>${c.descricao}</strong><div class="contract-links">${links}</div></td><td>${c.numeroParcelasCliente || 1}× ${moeda(c.valorParcelaCliente)}</td><td>${moeda(c.valorTotal)}${c.honorarioExitoPercentual ? `<br><small>+ ${c.honorarioExitoPercentual}% de êxito</small>` : ''}</td><td>${moeda(c.valorLiquidoPrevisto)}<br><small>tarifas: ${moeda(c.taxaCartaoValor)}</small></td><td>${dataBr(c.proximoVencimento)}<br><small>${moeda(c.proximaParcelaValor)}</small><br><span class="badge ${c.vencido ? 'risco-critico' : 'risco-baixo'}">${situacao}</span></td><td>${assinatura}</td><td><button class="btn-secondary btn-small" onclick="verContrato(${c.id})">Detalhes</button> <button class="btn-secondary btn-small" onclick="editarContrato(${c.id})">Editar</button> <button class="btn-secondary btn-small" onclick="excluir('contratos', ${c.id})">Excluir</button></td></tr>`;
  }).join('') || '<tr><td colspan="8">Nenhum contrato cadastrado.</td></tr>';
  document.querySelector('#tabela-pagamentos-soltos tbody').innerHTML = (f.pagamentosSemContrato || []).map((p) => `<tr><td>${dataBr(p.data)}</td><td>${p.descricao || 'Recebimento'}</td><td>${moeda(p.valor)}</td><td><button class="btn-secondary btn-small" onclick="editarPagamento(${p.id})">Corrigir e vincular</button></td></tr>`).join('') || '<tr><td colspan="4">Nenhum recebimento sem contrato.</td></tr>';
  renderContasAPagar();
  renderExtratoGeral();

  document.getElementById('fin-saldo-geral').textContent = moeda(f.saldoGeral);

  const mesBr = (mes) => {
    const [ano, m] = String(mes || '').split('-');
    const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    return m ? `${nomes[Number(m) - 1] || m}/${ano}` : mes;
  };
  const resumoMensal = f.resumoMensal || [];
  document.querySelector('#tabela-resumo-mensal tbody').innerHTML = resumoMensal.map((m) => `<tr><td>${mesBr(m.mes)}</td><td>${moeda(m.recebido)}</td><td>${moeda(m.gasto)}</td><td><span class="badge ${m.saldo >= 0 ? 'risco-baixo' : 'risco-critico'}">${moeda(m.saldo)}</span></td></tr>`).join('') || '<tr><td colspan="4">Sem dados suficientes ainda.</td></tr>';

}


// ---------- Financeiro: contas a pagar, extrato ----------
function mesBrLongo(mes) {
  const [ano, m] = String(mes || '').split('-');
  const nomes = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  return m ? `${nomes[Number(m) - 1] || m}/${ano}` : mes;
}
function renderContasAPagar() {
  const f = state.financeiro || {};
  const contas = f.contasAPagar || [];
  const resumo = [];
  if (f.totalAPagarVencido) resumo.push(`<strong style="color:#c0392b">${moeda(f.totalAPagarVencido)} vencido</strong>`);
  if (f.totalAPagar7dias) resumo.push(`${moeda(f.totalAPagar7dias)} vence nos próximos 7 dias`);
  document.getElementById('fin-apagar-total').innerHTML = contas.length ? ` Total em aberto: ${moeda(f.totalAPagar)} em ${contas.length} conta(s)${resumo.length ? ' — ' + resumo.join(' · ') : ''}.` : '';
  const classe = { 'Vencida': 'risco-critico', 'Vence em breve': 'risco-medio', 'A vencer': 'risco-baixo' };
  document.querySelector('#tabela-contas-pagar tbody').innerHTML = contas.map((c) => `<tr><td>${dataBr(c.vencimento)}</td><td>${c.categoria}</td><td>${c.descricao}${c.fixo ? ' <small>(fixa, mensal)</small>' : ''}</td><td><span class="badge ${classe[c.situacao]}">${c.situacao}</span></td><td>${moeda(c.valor)}</td><td><button class="btn-primary btn-small" onclick="pagarConta(${c.id})">Marcar como paga</button> <button class="btn-secondary btn-small" onclick="editarDespesa(${c.id})">Editar</button> <button class="btn-secondary btn-small" onclick="excluir('despesas', ${c.id})">Excluir</button></td></tr>`).join('') || '<tr><td colspan="6">Nenhuma conta a pagar. Use “+ Despesa” para lançar uma conta com vencimento.</td></tr>';
}
async function pagarConta(id) {
  const data = prompt('Data do pagamento (AAAA-MM-DD):', new Date().toISOString().slice(0, 10));
  if (data === null) return;
  try { await api(`/api/despesas/${id}/pagar`, { method:'POST', body:JSON.stringify({ data }) }); await carregarTudo(); } catch (e) { alert(e.message); }
}
function extratoFiltrado() {
  const f = state.financeiro || {};
  const mes = (document.getElementById('ext-mes') || {}).value || '';
  const tipo = (document.getElementById('ext-tipo') || {}).value || '';
  return (f.extratoGeral || []).filter((m) => (!mes || String(m.data || '').startsWith(mes)) && (!tipo || m.tipo === tipo));
}
function renderExtratoGeral() {
  const f = state.financeiro || {};
  const todos = f.extratoGeral || [];
  const seletor = document.getElementById('ext-mes');
  const atual = seletor.value;
  const meses = [...new Set(todos.map((m) => String(m.data || '').slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m)))].sort().reverse();
  const mesCorrente = new Date().toISOString().slice(0, 7);
  seletor.innerHTML = '<option value="">Todo o período</option>' + meses.map((m) => `<option value="${m}">${mesBrLongo(m)}</option>`).join('');
  seletor.value = atual !== '' && meses.includes(atual) ? atual : (atual === '' && seletor.dataset.iniciado ? '' : (meses.includes(mesCorrente) ? mesCorrente : ''));
  seletor.dataset.iniciado = '1';
  const linhas = extratoFiltrado();
  const entradas = linhas.filter((m) => m.tipo === 'Receita').reduce((s, m) => s + m.valor, 0);
  const saidas = linhas.filter((m) => m.tipo === 'Despesa').reduce((s, m) => s + m.valor, 0);
  document.getElementById('ext-entradas').textContent = moeda(entradas);
  document.getElementById('ext-saidas').textContent = moeda(saidas);
  const saldo = document.getElementById('ext-saldo');
  saldo.textContent = moeda(entradas - saidas);
  saldo.style.color = entradas - saidas >= 0 ? '#1e8449' : '#c0392b';
  document.querySelector('#tabela-extrato-geral tbody').innerHTML = linhas.map((m) => {
    const receita = m.tipo === 'Receita';
    const acao = receita ? `<button class="btn-secondary btn-small" onclick="editarPagamento(${m.id})">Editar</button> <button class="btn-secondary btn-small" onclick="excluir('pagamentos', ${m.id})">Excluir</button>` : `<button class="btn-secondary btn-small" onclick="editarDespesa(${m.id})">Editar</button> <button class="btn-secondary btn-small" onclick="excluir('despesas', ${m.id})">Excluir</button>`;
    return `<tr><td>${dataBr(m.data)}</td><td><span class="badge ${receita ? 'risco-baixo' : 'risco-critico'}">${m.tipo}</span></td><td>${m.categoria}</td><td>${m.descricao}<br><small>${m.detalhe || ''}</small></td><td style="color:${receita ? '#1e8449' : '#c0392b'}"><strong>${receita ? '+' : '−'} ${moeda(m.valor)}</strong></td><td>${moeda(m.saldoAcumulado)}</td><td>${acao}</td></tr>`;
  }).join('') || '<tr><td colspan="7">Nenhuma movimentação neste período.</td></tr>';
}
function exportarExtratoCsv() {
  const linhas = extratoFiltrado();
  const csv = ['Data;Tipo;Categoria;Descrição;Valor;Saldo acumulado'].concat(linhas.map((m) => [m.data, m.tipo, m.categoria, `"${String(m.descricao || '').replace(/"/g, '""')}"`, (m.tipo === 'Receita' ? '' : '-') + Number(m.valor).toFixed(2).replace('.', ','), Number(m.saldoAcumulado).toFixed(2).replace('.', ',')].join(';'))).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type:'text/csv;charset=utf-8' }));
  a.download = `extrato-${(document.getElementById('ext-mes').value || 'completo')}.csv`;
  a.click();
}
function verContrato(id) {
  const c = (state.financeiro.contratos || []).find((item) => item.id === id);
  if (!c) return;
  const repasses = (c.repasses || []).map((p) => `<div class="installment-row"><strong>${p.numero}º</strong><span>${dataBr(p.vencimento)}</span><span>${moeda(p.valor)}${p.valorPago ? ` · recebido ${moeda(p.valorPago)}` : ''}</span><span class="badge ${p.situacao === 'Atrasado' ? 'risco-critico' : 'risco-baixo'}">${p.situacao}</span></div>`).join('');
  const links = c.documentoDriveUrl ? `<a class="btn-secondary" href="${c.documentoDriveUrl}" target="_blank" rel="noopener">Abrir contrato assinado no Drive</a>` : '';
  modalBox.classList.add('modal-wide');
  modalBox.innerHTML = `<h3>${c.descricao}</h3><p><strong>${nomeCliente(c.clienteId)}</strong></p><div class="notice"><strong>Cliente:</strong> ${c.numeroParcelasCliente || 1}× ${moeda(c.valorParcelaCliente)} no ${c.formaPagamento || 'meio informado'}.<br><strong>Escritório:</strong> repasse líquido previsto de ${moeda(c.valorLiquidoPrevisto)}, após ${moeda(c.taxaCartaoValor)} de tarifas.</div>${c.honorarioExitoPercentual ? `<div class="notice">Honorários de êxito: ${c.honorarioExitoPercentual}% sobre ${c.honorarioExitoBase || 'a base definida no contrato'}. Este valor é condicional e não foi somado ao saldo fixo.</div>` : ''}<p><strong>Assinatura ZapSign:</strong> ${c.zapsignStatus || c.statusAssinatura || 'Não vinculada'}</p><h4>Repasse(s) da operadora</h4><div class="installment-list">${repasses}</div><div class="modal-actions">${links}${state.zapsign.apiConfigurada && c.zapsignToken ? `<button class="btn-secondary" onclick="sincronizarZapSign(${c.id})">Atualizar ZapSign</button>` : ''}${c.saldo ? `<button class="btn-primary" onclick="abrirModalPagamento(${c.id}, ${c.proximaParcelaValor || 0})">Registrar repasse recebido</button>` : ''}<button class="btn-secondary" onclick="fecharModal()">Fechar</button></div>`;
  overlay.classList.add('active');
}

async function sincronizarZapSign(id) {
  try {
    await api(`/api/integracoes/zapsign/contratos/${id}/sincronizar`, { method: 'POST' });
    fecharModal(); await carregarTudo();
  } catch (e) { alert(e.message); }
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
    data: { labels: AREAS, datasets: [{ data: porArea, backgroundColor: '#5a4636' }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } },
  });
}

function renderUsuarios() {
  const tbody = document.querySelector('#tabela-usuarios tbody');
  if (!tbody) return;
  tbody.innerHTML = state.usuarios.map((u) => `
    <tr>
      <td>${u.nome}</td>
      <td>${u.email}</td>
      <td>${u.role === 'admin' ? 'Administradora' : 'Membro'}${u.precisaTrocarSenha ? ' <span class="badge status-Aguardando">senha temporária</span>' : ''}</td>
      <td><button class="btn-icon" title="Remover" onclick="excluirUsuario(${u.id})">🗑️</button></td>
    </tr>`).join('') || '<tr><td colspan="4">Nenhum usuário cadastrado ainda.</td></tr>';
}

function abrirModalLead() {
  modalBox.innerHTML = `<h3>Novo Lead</h3><label>Nome</label><input id="f-nome"><label>Telefone / WhatsApp</label><input id="f-telefone"><label>Origem</label><input id="f-origem" placeholder="Ex.: indicação, Instagram"><label>Etapa</label><select id="f-etapa">${opcoesLista(ETAPAS_LEAD, '1. Prospecção')}</select><div class="modal-actions"><button class="btn-secondary" onclick="fecharModal()">Cancelar</button><button class="btn-primary" onclick="salvarLead()">Salvar</button></div>`;
  overlay.classList.add('active');
}
async function salvarLead() {
  await api('/api/leads', { method:'POST', body:JSON.stringify({ nome:document.getElementById('f-nome').value, telefone:document.getElementById('f-telefone').value, origem:document.getElementById('f-origem').value, etapa:document.getElementById('f-etapa').value }) });
  fecharModal(); await carregarTudo();
}
async function moverLead(id) {
  const lead = state.leads.find((l) => l.id === id);
  const pos = ETAPAS_LEAD.indexOf(lead.etapa);
  await api(`/api/leads/${id}`, { method:'PUT', body:JSON.stringify({ etapa:ETAPAS_LEAD[Math.min(pos + 1, ETAPAS_LEAD.length - 1)] }) });
  await carregarTudo();
}

function abrirModalTarefa(processoId) {
  modalBox.innerHTML = `<h3>Nova Tarefa</h3><label>Título</label><input id="f-titulo"><label>Processo</label><select id="f-processo">${opcoesProcessos(processoId)}</select><label>Prazo</label><input type="date" id="f-prazo"><label>Tipo de prazo</label><select id="f-tipo-prazo"><option>Interno</option><option>Fatal</option></select><label>Prioridade</label><select id="f-prioridade"><option>Alta</option><option selected>Média</option><option>Baixa</option></select><label>Status</label><select id="f-status-tarefa">${opcoesLista(STATUS_TAREFA, 'A fazer')}</select><div class="modal-actions"><button class="btn-secondary" onclick="fecharModal()">Cancelar</button><button class="btn-primary" onclick="salvarTarefa()">Salvar</button></div>`;
  overlay.classList.add('active');
}
async function salvarTarefa() {
  await api('/api/tarefas', { method:'POST', body:JSON.stringify({ titulo:document.getElementById('f-titulo').value, processoId:Number(document.getElementById('f-processo').value)||null, prazo:document.getElementById('f-prazo').value, tipoPrazo:document.getElementById('f-tipo-prazo').value, prioridade:document.getElementById('f-prioridade').value, status:document.getElementById('f-status-tarefa').value, responsavelId:usuarioAtual.id }) });
  fecharModal(); await carregarTudo();
}
function editarTarefa(id) {
  const t = state.tarefas.find((x) => x.id === id);
  if (!t) return;
  modalBox.innerHTML = `<h3>Editar Tarefa</h3><label>Título</label><input id="f-titulo" value="${(t.titulo || '').replace(/"/g, '&quot;')}"><label>Processo</label><select id="f-processo">${opcoesProcessos(t.processoId)}</select><label>Prazo</label><input type="date" id="f-prazo" value="${t.prazo || ''}"><label>Tipo de prazo</label><select id="f-tipo-prazo">${opcoesLista(['Interno', 'Fatal'], t.tipoPrazo || 'Interno')}</select><label>Prioridade</label><select id="f-prioridade">${opcoesLista(['Alta', 'Média', 'Baixa'], t.prioridade || 'Média')}</select><label>Status</label><select id="f-status-tarefa">${opcoesLista(STATUS_TAREFA, t.status || 'A fazer')}</select><label>Observações</label><textarea id="f-observacoes" rows="3">${t.observacoes || ''}</textarea><div class="modal-actions"><button class="btn-secondary" onclick="fecharModal()">Cancelar</button><button class="btn-primary" onclick="salvarEdicaoTarefa(${id})">Salvar</button></div>`;
  overlay.classList.add('active');
}
async function salvarEdicaoTarefa(id) {
  await api(`/api/tarefas/${id}`, { method:'PUT', body:JSON.stringify({ titulo:document.getElementById('f-titulo').value, processoId:Number(document.getElementById('f-processo').value)||null, prazo:document.getElementById('f-prazo').value || null, tipoPrazo:document.getElementById('f-tipo-prazo').value, prioridade:document.getElementById('f-prioridade').value, status:document.getElementById('f-status-tarefa').value, observacoes:document.getElementById('f-observacoes').value }) });
  fecharModal(); await carregarTudo();
}
function concluirTarefa(id) {
  modalBox.innerHTML = `<h3>Concluir tarefa</h3><div class="notice">Registre como o trabalho pode ser conferido: protocolo, link, documento, e-mail enviado ou resumo objetivo.</div><label>Evidência da conclusão</label><textarea id="f-evidencia" rows="4" placeholder="Ex.: Petição protocolada no PJe, ID 123456."></textarea><label class="check-line"><input type="checkbox" id="f-revisao"> Enviar para revisão antes da conclusão definitiva</label><div class="modal-actions"><button class="btn-secondary" onclick="fecharModal()">Cancelar</button><button class="btn-primary" onclick="salvarConclusaoTarefa(${id})">Registrar</button></div>`;
  overlay.classList.add('active');
}
async function salvarConclusaoTarefa(id) {
  try {
    await api(`/api/tarefas/${id}/concluir`, { method:'POST', body:JSON.stringify({ evidencia:document.getElementById('f-evidencia').value, enviarParaRevisao:document.getElementById('f-revisao').checked }) });
    fecharModal(); await carregarTudo();
  } catch (e) { alert(e.message); }
}
async function revisarTarefa(id) {
  const observacao = prompt('Observação da revisão (opcional):') || '';
  await api(`/api/tarefas/${id}/revisar`, { method:'POST', body:JSON.stringify({ observacao }) });
  await carregarTudo();
}

function abrirModalPublicacao() {
  modalBox.innerHTML = `<h3>Registrar publicação</h3><label>Processo cadastrado (se localizado)</label><select id="f-processo">${opcoesProcessos()}</select><label>Número CNJ informado na publicação</label><input id="f-numero-processo" placeholder="0000000-00.0000.0.00.0000"><label>Descrição</label><textarea id="f-descricao" rows="4"></textarea><label>Data da publicação</label><input type="date" id="f-data-publicacao"><label>Prazo fatal</label><input type="date" id="f-prazo-fatal"><label>Tribunal/órgão</label><select id="f-tribunal"><option>TJMG</option><option>TRT-3</option><option>TRF-6</option><option>DJEN/CNJ</option><option>Outro</option></select><div class="modal-actions"><button class="btn-secondary" onclick="fecharModal()">Cancelar</button><button class="btn-primary" onclick="salvarPublicacao()">Salvar</button></div>`;
  overlay.classList.add('active');
}
async function salvarPublicacao() {
  await api('/api/publicacoes', { method:'POST', body:JSON.stringify({ processoId:Number(document.getElementById('f-processo').value)||null, numeroProcesso:document.getElementById('f-numero-processo').value, descricao:document.getElementById('f-descricao').value, dataPublicacao:document.getElementById('f-data-publicacao').value, prazoFatal:document.getElementById('f-prazo-fatal').value, tribunal:document.getElementById('f-tribunal').value }) });
  fecharModal(); await carregarTudo();
}
async function criarTarefaPublicacao(id) {
  await api(`/api/publicacoes/${id}/criar-tarefa`, { method:'POST', body:JSON.stringify({ responsavelId:usuarioAtual.id }) });
  await carregarTudo();
}

function abrirModalContrato() {
  modalBox.classList.add('modal-wide');
  modalBox.innerHTML = `<h3>Novo contrato de honorários</h3><label>Cliente</label><select id="f-cliente"><option value="">— selecione —</option>${opcoesClientes()}</select><label>Processo (opcional)</label><select id="f-processo">${opcoesProcessos()}</select><label>Descrição</label><input id="f-descricao" placeholder="Ex.: Honorários ação previdenciária"><label>Tipo de honorário</label><select id="f-tipo-honorario"><option>Fixo</option><option>Êxito</option><option selected>Misto</option></select><h4>Condição oferecida à cliente</h4><label>Valor bruto contratado</label><input id="f-valor" type="number" min="0" step="0.01" oninput="recalcularContratoCartao()"><label>Parcelas da cliente</label><input id="f-parcelas-cliente" type="number" min="1" step="1" value="1" oninput="recalcularContratoCartao()"><label>Valor de cada parcela</label><input id="f-valor-parcela-cliente" type="number" min="0" step="0.01"><label>Forma de pagamento</label><select id="f-forma-pagamento"><option>Cartão de crédito</option><option>PIX</option><option>Boleto</option><option>Transferência</option><option>Dinheiro</option><option>Outro</option></select><h4>Entrada à vista (opcional)</h4><div class="notice">Se a cliente pagou uma entrada à vista além das parcelas acima, informe aqui — o sistema já registra esse recebimento sozinho ao salvar o contrato, vinculado a ele.</div><label>Valor da entrada</label><input id="f-entrada-valor" type="number" min="0" step="0.01" placeholder="Ex.: 1000.00"><label>Data da entrada</label><input id="f-entrada-data" type="date" value="${new Date().toISOString().slice(0, 10)}"><h4>Repasse ao escritório</h4><div class="notice">Informe o valor líquido total e a data do 1º repasse. Marque a opção abaixo se o escritório recebe parcelado (mês a mês, junto com a cliente); se desmarcada, o valor todo é tratado como um único repasse numa só data.</div><label class="check-line"><input type="checkbox" id="f-repasse-parcelado" onchange="recalcularContratoCartao()"> Repasse ao escritório vem parcelado (1 repasse por parcela da cliente)</label><label>Tarifas descontadas pela operadora</label><input id="f-taxa-cartao" type="number" min="0" step="0.01" oninput="recalcularContratoCartao('taxa')"><label>Valor líquido total previsto</label><input id="f-liquido-previsto" type="number" min="0" step="0.01" oninput="recalcularContratoCartao('liquido')"><label>Data do 1º repasse</label><input id="f-data-repasse" type="date"><label>Data do contrato</label><input id="f-data-contrato" type="date"><label>Honorários de êxito (%)</label><input id="f-exito" type="number" min="0" max="100" step="0.01"><label>Base dos honorários de êxito</label><input id="f-base-exito" placeholder="Ex.: valor da causa e eventual multa"><label>Link permanente do contrato assinado no Drive</label><input id="f-drive-url" type="url" placeholder="https://drive.google.com/..."><label>Identificador do documento na ZapSign</label><input id="f-zapsign-token" placeholder="Token/UUID do documento"><label>Status da assinatura</label><select id="f-zapsign-status"><option>Aguardando assinatura</option><option>Assinado</option><option>Recusado</option><option>Expirado</option></select><label>Status financeiro</label><select id="f-status"><option>Ativo</option><option>Quitado</option><option>Cancelado</option></select><div class="modal-actions"><button class="btn-secondary" onclick="fecharModal()">Cancelar</button><button class="btn-primary" onclick="salvarContrato()">Salvar contrato</button></div>`;
  overlay.classList.add('active');
}
function recalcularContratoCartao(origem = 'total') {
  const total = Number(document.getElementById('f-valor').value) || 0;
  const quantidade = Number(document.getElementById('f-parcelas-cliente').value) || 1;
  const taxa = Number(document.getElementById('f-taxa-cartao').value) || 0;
  const liquido = Number(document.getElementById('f-liquido-previsto').value) || 0;
  document.getElementById('f-valor-parcela-cliente').value = (total / quantidade).toFixed(2);
  if (origem === 'liquido') document.getElementById('f-taxa-cartao').value = Math.max(0, total - liquido).toFixed(2);
  else document.getElementById('f-liquido-previsto').value = Math.max(0, total - taxa).toFixed(2);
}
async function salvarContrato() {
  try {
    const novoContrato = await api('/api/contratos', { method:'POST', body:JSON.stringify(lerFormularioContrato()) });
    const entradaEl = document.getElementById('f-entrada-valor');
    const valorEntrada = entradaEl ? Number(entradaEl.value) || 0 : 0;
    if (valorEntrada > 0) {
      await api('/api/pagamentos', { method:'POST', body:JSON.stringify({ contratoId:novoContrato.id, data:document.getElementById('f-entrada-data').value || new Date().toISOString().slice(0, 10), valor:valorEntrada, descricao:'Entrada à vista' }) });
    }
    fecharModal(); await carregarTudo();
  } catch (e) { alert(e.message); }
}
function lerFormularioContrato() {
  const numeroParcelasCliente = Number(document.getElementById('f-parcelas-cliente').value)||1;
  const repasseParcelado = document.getElementById('f-repasse-parcelado').checked;
  return { clienteId:Number(document.getElementById('f-cliente').value)||null, processoId:Number(document.getElementById('f-processo').value)||null, descricao:document.getElementById('f-descricao').value, tipoHonorario:document.getElementById('f-tipo-honorario').value, valorTotal:Number(document.getElementById('f-valor').value), numeroParcelasCliente, valorParcelaCliente:Number(document.getElementById('f-valor-parcela-cliente').value)||0, formaPagamento:document.getElementById('f-forma-pagamento').value, numeroRepasses: repasseParcelado ? numeroParcelasCliente : 1, repasses: [], taxaCartaoValor:Number(document.getElementById('f-taxa-cartao').value)||0, valorLiquidoPrevisto:Number(document.getElementById('f-liquido-previsto').value)||0, dataPrimeiroRepasse:document.getElementById('f-data-repasse').value||null, dataContrato:document.getElementById('f-data-contrato').value||null, honorarioExitoPercentual:Number(document.getElementById('f-exito').value)||0, honorarioExitoBase:document.getElementById('f-base-exito').value, documentoDriveUrl:document.getElementById('f-drive-url').value||null, zapsignToken:document.getElementById('f-zapsign-token').value||null, zapsignStatus:document.getElementById('f-zapsign-status').value, status:document.getElementById('f-status').value };
}
function editarContrato(id) {
  const c = state.contratos.find((item) => item.id === id);
  if (!c) return;
  modalBox.classList.add('modal-wide');
  modalBox.innerHTML = `<h3>Corrigir contrato</h3><label>Cliente</label><select id="f-cliente"><option value="">— selecione —</option>${opcoesClientes(c.clienteId)}</select><label>Processo (opcional)</label><select id="f-processo">${opcoesProcessos(c.processoId)}</select><label>Descrição</label><input id="f-descricao" value="${textoSeguro(c.descricao || '')}"><label>Tipo de honorário</label><select id="f-tipo-honorario">${opcoesLista(['Fixo', 'Êxito', 'Misto'], c.tipoHonorario || 'Misto')}</select><h4>Condição oferecida à cliente</h4><label>Valor bruto contratado</label><input id="f-valor" type="number" min="0" step="0.01" value="${c.valorTotal || ''}" oninput="recalcularContratoCartao()"><label>Parcelas da cliente</label><input id="f-parcelas-cliente" type="number" min="1" step="1" value="${c.numeroParcelasCliente || 1}" oninput="recalcularContratoCartao()"><label>Valor de cada parcela</label><input id="f-valor-parcela-cliente" type="number" min="0" step="0.01" value="${c.valorParcelaCliente || ''}"><label>Forma de pagamento</label><select id="f-forma-pagamento">${opcoesLista(['Cartão de crédito', 'PIX', 'Boleto', 'Transferência', 'Dinheiro', 'Outro'], c.formaPagamento || 'Cartão de crédito')}</select><h4>Repasse ao escritório</h4><div class="notice">Informe o valor líquido total e a data do 1º repasse. Marque a opção abaixo se o escritório recebe parcelado (mês a mês, junto com a cliente); se desmarcada, o valor todo é tratado como um único repasse numa só data.</div><label class="check-line"><input type="checkbox" id="f-repasse-parcelado" ${(c.numeroRepasses || 1) > 1 ? 'checked' : ''} onchange="recalcularContratoCartao()"> Repasse ao escritório vem parcelado (1 repasse por parcela da cliente)</label><label>Tarifas descontadas pela operadora</label><input id="f-taxa-cartao" type="number" min="0" step="0.01" value="${c.taxaCartaoValor || ''}" oninput="recalcularContratoCartao('taxa')"><label>Valor líquido total previsto</label><input id="f-liquido-previsto" type="number" min="0" step="0.01" value="${c.valorLiquidoPrevisto || ''}" oninput="recalcularContratoCartao('liquido')"><label>Data do 1º repasse</label><input id="f-data-repasse" type="date" value="${c.dataPrimeiroRepasse || ''}"><label>Data do contrato</label><input id="f-data-contrato" type="date" value="${c.dataContrato || ''}"><label>Honorários de êxito (%)</label><input id="f-exito" type="number" min="0" max="100" step="0.01" value="${c.honorarioExitoPercentual || ''}"><label>Base dos honorários de êxito</label><input id="f-base-exito" value="${textoSeguro(c.honorarioExitoBase || '')}" placeholder="Ex.: valor da causa e eventual multa"><label>Link permanente do contrato assinado no Drive</label><input id="f-drive-url" type="url" value="${c.documentoDriveUrl || ''}" placeholder="https://drive.google.com/..."><label>Identificador do documento na ZapSign</label><input id="f-zapsign-token" value="${c.zapsignToken || ''}" placeholder="Token/UUID do documento"><label>Status da assinatura</label><select id="f-zapsign-status">${opcoesLista(['Aguardando assinatura', 'Assinado', 'Recusado', 'Expirado'], c.zapsignStatus || 'Aguardando assinatura')}</select><label>Status financeiro</label><select id="f-status">${opcoesLista(['Ativo', 'Quitado', 'Cancelado'], c.status || 'Ativo')}</select><div class="modal-actions"><button class="btn-secondary" onclick="fecharModal()">Cancelar</button><button class="btn-primary" onclick="salvarEdicaoContrato(${id})">Salvar correção</button></div>`;
  overlay.classList.add('active');
}
async function salvarEdicaoContrato(id) {
  try {
    await api(`/api/contratos/${id}`, { method:'PUT', body:JSON.stringify(lerFormularioContrato()) });
    fecharModal(); await carregarTudo();
  } catch (e) { alert(e.message); }
}
function abrirModalPagamento(contratoId = null, valorSugerido = null) {
  fecharModal();
  const opcoes = state.contratos.map((c) => `<option value="${c.id}">${c.descricao} · ${nomeCliente(c.clienteId)}</option>`).join('');
  modalBox.innerHTML = `<h3>Registrar recebimento</h3><label>Contrato (deixe vazio se ainda não conciliado)</label><select id="f-contrato"><option value="">— não conciliado —</option>${opcoes}</select><label>Data</label><input id="f-data" type="date" value="${new Date().toISOString().slice(0, 10)}"><label>Valor líquido recebido</label><input id="f-valor" type="number" min="0" step="0.01" value="${valorSugerido || ''}"><label>Descrição / comprovante</label><input id="f-descricao" placeholder="Ex.: Repasse líquido da operadora do cartão"><div class="modal-actions"><button class="btn-secondary" onclick="fecharModal()">Cancelar</button><button class="btn-primary" onclick="salvarPagamento()">Salvar</button></div>`;
  overlay.classList.add('active');
  if (contratoId) document.getElementById('f-contrato').value = String(contratoId);
}
function editarPagamento(id) {
  const pagamento = state.pagamentos.find((p) => p.id === id);
  if (!pagamento) return;
  const opcoes = state.contratos.map((c) => `<option value="${c.id}">${c.descricao} · ${nomeCliente(c.clienteId)}</option>`).join('');
  modalBox.innerHTML = `<h3>Corrigir e conciliar recebimento</h3><label>Contrato</label><select id="f-contrato"><option value="">— não conciliado —</option>${opcoes}</select><label>Data efetiva do crédito</label><input id="f-data" type="date" value="${pagamento.data || ''}"><label>Valor líquido recebido</label><input id="f-valor" type="number" min="0" step="0.01" value="${pagamento.valor || ''}"><label>Descrição / comprovante</label><input id="f-descricao" value="${pagamento.descricao || ''}"><div class="modal-actions"><button class="btn-secondary" onclick="fecharModal()">Cancelar</button><button class="btn-primary" onclick="salvarEdicaoPagamento(${id})">Salvar correção</button></div>`;
  overlay.classList.add('active');
  document.getElementById('f-contrato').value = pagamento.contratoId ? String(pagamento.contratoId) : '';
}
async function salvarEdicaoPagamento(id) {
  try {
    await api(`/api/pagamentos/${id}`, { method:'PUT', body:JSON.stringify({ contratoId:Number(document.getElementById('f-contrato').value)||null, data:document.getElementById('f-data').value, valor:Number(document.getElementById('f-valor').value), descricao:document.getElementById('f-descricao').value }) });
    fecharModal(); await carregarTudo();
  } catch (e) { alert(e.message); }
}
async function salvarPagamento() {
  try {
    await api('/api/pagamentos', { method:'POST', body:JSON.stringify({ contratoId:Number(document.getElementById('f-contrato').value)||null, data:document.getElementById('f-data').value, valor:Number(document.getElementById('f-valor').value), descricao:document.getElementById('f-descricao').value }) });
    fecharModal(); await carregarTudo();
  } catch (e) { alert(e.message); }
}
function opcoesCategoriaDespesa(selecionada) {
  return CATEGORIAS_DESPESA.map((c) => `<option value="${c}" ${c === selecionada ? 'selected' : ''}>${c}</option>`).join('');
}
function abrirModalDespesa() {
  fecharModal();
  modalBox.innerHTML = `<h3>Registrar despesa</h3><label>Categoria</label><select id="f-categoria">${opcoesCategoriaDespesa()}</select><label>Descrição</label><input id="f-descricao" placeholder="Ex.: Aluguel da sala, assinatura do sistema..."><label>Valor</label><input id="f-valor" type="number" min="0" step="0.01"><label>Vencimento (ou data do gasto)</label><input id="f-data" type="date" value="${new Date().toISOString().slice(0, 10)}"><label class="check-line"><input id="f-paga" type="checkbox"> Já foi paga (entra direto no extrato como despesa)</label><label class="check-line"><input id="f-fixo" type="checkbox"> É um gasto fixo (se repete todo mês, tipo aluguel ou assinatura)</label><div class="modal-actions"><button class="btn-secondary" onclick="fecharModal()">Cancelar</button><button class="btn-primary" onclick="salvarDespesa()">Salvar</button></div>`;
  overlay.classList.add('active');
}
function editarDespesa(id) {
  const despesa = state.despesas.find((d) => d.id === id);
  if (!despesa) return;
  modalBox.innerHTML = `<h3>Corrigir despesa</h3><label>Categoria</label><select id="f-categoria">${opcoesCategoriaDespesa(despesa.categoria)}</select><label>Descrição</label><input id="f-descricao" value="${textoSeguro(despesa.descricao || '')}"><label>Valor</label><input id="f-valor" type="number" min="0" step="0.01" value="${despesa.valor || ''}"><label>Vencimento (ou data do gasto)</label><input id="f-data" type="date" value="${despesa.data || ''}"><label class="check-line"><input id="f-fixo" type="checkbox" ${despesa.fixo ? 'checked' : ''}> É um gasto fixo (se repete todo mês, tipo aluguel ou assinatura)</label><div class="modal-actions"><button class="btn-secondary" onclick="fecharModal()">Cancelar</button><button class="btn-primary" onclick="salvarEdicaoDespesa(${id})">Salvar correção</button></div>`;
  overlay.classList.add('active');
}
async function salvarEdicaoDespesa(id) {
  try {
    await api(`/api/despesas/${id}`, { method:'PUT', body:JSON.stringify({ categoria:document.getElementById('f-categoria').value, descricao:document.getElementById('f-descricao').value, valor:Number(document.getElementById('f-valor').value), data:document.getElementById('f-data').value, fixo:document.getElementById('f-fixo').checked }) });
    fecharModal(); await carregarTudo();
  } catch (e) { alert(e.message); }
}
async function salvarDespesa() {
  try {
    await api('/api/despesas', { method:'POST', body:JSON.stringify({ categoria:document.getElementById('f-categoria').value, descricao:document.getElementById('f-descricao').value, valor:Number(document.getElementById('f-valor').value), data:document.getElementById('f-data').value, fixo:document.getElementById('f-fixo').checked, status: document.getElementById('f-paga').checked ? 'Pago' : 'Pendente', dataPagamento: document.getElementById('f-paga').checked ? document.getElementById('f-data').value : null }) });
    fecharModal(); await carregarTudo();
  } catch (e) { alert(e.message); }
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
  modalBox.classList.remove('modal-wide');
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

let salvandoCliente = false;
async function salvarCliente(id) {
  if (salvandoCliente) return;
  salvandoCliente = true;
  const botaoSalvar = modalBox.querySelector('.btn-primary');
  if (botaoSalvar) {
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = 'Salvando...';
  }
  const body = {
    nome: document.getElementById('f-nome').value,
    documento: document.getElementById('f-documento').value,
    telefone: document.getElementById('f-telefone').value,
    email: document.getElementById('f-email').value,
    endereco: document.getElementById('f-endereco').value,
  };
  try {
    if (id) await api(`/api/clientes/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/api/clientes', { method: 'POST', body: JSON.stringify(body) });
    fecharModal();
    await carregarTudo();
  } finally {
    salvandoCliente = false;
    if (botaoSalvar?.isConnected) {
      botaoSalvar.disabled = false;
      botaoSalvar.textContent = 'Salvar';
    }
  }
}

function abrirModalProcuracao(id) {
  const c = state.clientes.find((item) => item.id === Number(id));
  if (!c) return;
  const ativa = state.documentos.find((item) =>
    item.clienteId === c.id && item.tipo === 'Procuração' &&
    !['Assinado', 'Recusado', 'Expirado', 'Excluído'].includes(item.zapsignStatus)
  );
  modalBox.classList.add('modal-wide');
  if (ativa) {
    modalBox.innerHTML = `
      <h3>Procuração de ${textoSeguro(c.nome)}</h3>
      <div class="notice">Já existe uma procuração ativa. Para evitar duas procurações ocupando a numeração documental, utilize o documento existente.</div>
      <p><strong>Status:</strong> ${textoSeguro(ativa.statusAssinatura || 'Gerada')}</p>
      <div class="modal-actions">
        <a class="btn-secondary" href="${ativa.arquivo}" target="_blank" rel="noopener">Abrir PDF</a>
        ${ativa.driveFileUrl ? `<button class="btn-primary" onclick="copiarLinkAssinatura('${textoSeguro(ativa.driveFileUrl)}')">Copiar link para assinatura</button>` : ''}
        <button class="btn-secondary" onclick="fecharModal()">Fechar</button>
      </div>`;
    overlay.classList.add('active');
    return;
  }
  const hoje = new Date().toISOString().slice(0, 10);
  modalBox.innerHTML = `
    <h3>Gerar procuração</h3>
    <div class="notice">Confira os dados da outorgante. Ao confirmar, o CRM gera o PDF, salva como <strong>02 - PROCURAÇÃO</strong> no Drive e devolve o link para você encaminhar à cliente assinar manualmente (baixar, assinar e reenviar).</div>
    <div class="form-grid">
      <div class="form-span-2"><label>Nome completo</label><input id="p-nome" value="${textoSeguro(c.nome || '')}"></div>
      <div><label>CPF</label><input id="p-cpf" value="${textoSeguro(c.documento || '')}" placeholder="000.000.000-00"></div>
      <div><label>RG</label><input id="p-rg" value="${textoSeguro(c.rg || '')}"></div>
      <div><label>Órgão emissor</label><input id="p-orgao" value="${textoSeguro(c.orgaoEmissor || 'Instituto de Identificação PC/MG')}"></div>
      <div><label>Nacionalidade</label><input id="p-nacionalidade" value="${textoSeguro(c.nacionalidade || 'brasileira')}"></div>
      <div><label>Estado civil</label><input id="p-estado-civil" value="${textoSeguro(c.estadoCivil || '')}" placeholder="Ex.: solteira"></div>
      <div><label>Profissão</label><input id="p-profissao" value="${textoSeguro(c.profissao || '')}"></div>
      <div class="form-span-2"><label>Endereço completo</label><textarea id="p-endereco" rows="3" placeholder="Rua, número, complemento, bairro, CEP, cidade e estado">${textoSeguro(c.endereco || '')}</textarea></div>
      <div><label>E-mail para a ZapSign</label><input id="p-email" type="email" value="${textoSeguro(c.email || '')}"></div>
      <div><label>Telefone</label><input id="p-telefone" value="${textoSeguro(c.telefone || '')}"></div>
      <div><label>Local da assinatura</label><input id="p-local" value="${textoSeguro(c.cidade || 'Caratinga')}"></div>
      <div><label>Data da procuração</label><input id="p-data" type="date" value="${hoje}"></div>
      <div class="form-span-2"><label>Advogado(a) adicional (opcional — só se o caso exigir mais de uma outorgada)</label><textarea id="p-outorgado-adicional" rows="2" placeholder="Ex.: MARIA DA SILVA, brasileira, solteira, advogada inscrita na OAB/MG sob o nº 000.000, com escritório situado na Rua X, 100, Centro, Cidade/UF, CEP 00.000-000"></textarea></div>
      <div class="form-span-2"><label>Processo vinculado (opcional)</label><select id="p-processo">${opcoesProcessos()}</select></div>
    </div>
    <div id="p-erro" class="erro-inline" style="display:none;"></div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="fecharModal()">Cancelar</button>
      <button class="btn-primary" id="p-enviar" onclick="gerarProcuracao(${c.id})">Gerar PDF e link para assinatura</button>
    </div>`;
  overlay.classList.add('active');
}

async function gerarProcuracao(clienteId) {
  const botao = document.getElementById('p-enviar');
  const erro = document.getElementById('p-erro');
  botao.disabled = true;
  botao.textContent = 'Gerando e enviando...';
  erro.style.display = 'none';
  try {
    const resultado = await api(`/api/clientes/${clienteId}/procuracao`, {
      method: 'POST',
      body: JSON.stringify({
        nome: document.getElementById('p-nome').value,
        cpf: document.getElementById('p-cpf').value,
        rg: document.getElementById('p-rg').value,
        orgaoEmissor: document.getElementById('p-orgao').value,
        nacionalidade: document.getElementById('p-nacionalidade').value,
        estadoCivil: document.getElementById('p-estado-civil').value,
        profissao: document.getElementById('p-profissao').value,
        enderecoCompleto: document.getElementById('p-endereco').value,
        email: document.getElementById('p-email').value,
        telefone: document.getElementById('p-telefone').value,
        localAssinatura: document.getElementById('p-local').value,
        dataAssinatura: document.getElementById('p-data').value,
        processoId: Number(document.getElementById('p-processo').value) || null,
        outorgadoAdicional: document.getElementById('p-outorgado-adicional').value,
        enviarZapSign: false,
      }),
    });
    await carregarTudo();
    const d = resultado.documento;
    const z = resultado.zapsign;
    modalBox.innerHTML = `
      <h3>Procuração gerada</h3>
      <div class="empty-success">O PDF foi criado e registrado na rotina documental.</div>
      ${resultado.aviso ? `<div class="notice" style="margin-top:14px;">${textoSeguro(resultado.aviso)}</div>` : ''}
      <p><strong>Drive:</strong> ${d.driveSyncStatus === 'Sincronizado' ? 'salva como 02 - PROCURAÇÃO' : textoSeguro(d.driveSyncStatus || 'pendente')}</p>
      ${d.driveFileUrl ? '<p>Copie o link abaixo e encaminhe à cliente para baixar, assinar e reenviar.</p>' : '<p>A pasta ainda está sincronizando com o Drive — o link aparece em instantes.</p>'}
      <div class="modal-actions">
        <a class="btn-secondary" href="${d.arquivo}" target="_blank" rel="noopener">Abrir PDF</a>
        ${d.driveFileUrl ? `<button class="btn-primary" onclick="copiarLinkAssinatura('${textoSeguro(d.driveFileUrl)}')">Copiar link para assinatura</button>` : ''}
        <button class="btn-secondary" onclick="fecharModal()">Fechar</button>
      </div>`;
  } catch (e) {
    erro.textContent = e.message;
    erro.style.display = 'block';
    botao.disabled = false;
    botao.textContent = 'Gerar PDF e link para assinatura';
  }
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
    <label>Ação / nome do processo</label><input id="f-nome" value="${p.nome || ''}" />
    <label>Número CNJ</label><input id="f-numero-processo-cnj" value="${p.numeroProcesso || ''}" placeholder="0000000-00.0000.0.00.0000" />
    <label>Cliente</label><select id="f-cliente"><option value="">— nenhum —</option>${opcoesClientes(p.clienteId)}</select>
    <label>Área</label><select id="f-area">${opcoesLista(AREAS, p.area)}</select>
    <label>Tipo</label><select id="f-tipo">${opcoesLista(TIPOS_PROCESSO, p.tipo)}</select>
    <label>Status</label><select id="f-status">${opcoesLista(STATUSES, p.id ? statusKanban(p) : 'A confirmar')}</select>
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
    numeroProcesso: document.getElementById('f-numero-processo-cnj').value,
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
  const res = await fetch('/api/documentos', { method: 'POST', body: fd });
  if (res.status === 401) { window.location.href = '/login.html'; return; }
  fecharModal();
  await carregarTudo();
}

// ---------- usuários (somente admin) ----------
function abrirModalUsuario() {
  modalBox.innerHTML = `
    <h3>Novo Usuário</h3>
    <label>Nome completo</label><input id="f-nome" />
    <label>E-mail</label><input type="email" id="f-email" />
    <label>Senha temporária</label><input type="text" id="f-senha" placeholder="Defina uma senha para o primeiro acesso" />
    <label>Perfil</label>
    <select id="f-role">
      <option value="membro">Membro da equipe</option>
      <option value="admin">Administradora</option>
    </select>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="fecharModal()">Cancelar</button>
      <button class="btn-primary" onclick="salvarUsuario()">Salvar</button>
    </div>
    <div class="erro" id="erro-usuario" style="display:none;color:#a33;font-size:13px;margin-top:10px;"></div>`;
  overlay.classList.add('active');
}

async function salvarUsuario() {
  const body = {
    nome: document.getElementById('f-nome').value,
    email: document.getElementById('f-email').value,
    senha: document.getElementById('f-senha').value,
    role: document.getElementById('f-role').value,
  };
  try {
    await api('/api/usuarios', { method: 'POST', body: JSON.stringify(body) });
    fecharModal();
    await carregarTudo();
  } catch (e) {
    const erroEl = document.getElementById('erro-usuario');
    erroEl.textContent = e.message;
    erroEl.style.display = 'block';
  }
}

async function excluirUsuario(id) {
  if (!confirm('Remover este usuário? A pessoa perderá o acesso imediatamente.')) return;
  try {
    await api(`/api/usuarios/${id}`, { method: 'DELETE' });
    await carregarTudo();
  } catch (e) {
    alert(e.message);
  }
}

// ---------- trocar senha ----------
function abrirModalTrocarSenha(obrigatorio) {
  modalBox.innerHTML = `
    <h3>${obrigatorio ? 'Defina sua senha' : 'Trocar minha senha'}</h3>
    ${obrigatorio ? '<div class="notice">Por segurança, defina uma senha nova antes de continuar.</div>' : ''}
    <label>Senha atual</label><input type="password" id="f-senha-atual" />
    <label>Nova senha (mínimo 8 caracteres)</label><input type="password" id="f-nova-senha" />
    <div class="modal-actions">
      ${obrigatorio ? '' : '<button class="btn-secondary" onclick="fecharModal()">Cancelar</button>'}
      <button class="btn-primary" onclick="salvarTrocarSenha(${!!obrigatorio})">Salvar</button>
    </div>
    <div class="erro" id="erro-senha" style="display:none;color:#a33;font-size:13px;margin-top:10px;"></div>`;
  overlay.classList.add('active');
}

async function salvarTrocarSenha(obrigatorio) {
  const body = {
    senhaAtual: document.getElementById('f-senha-atual').value,
    novaSenha: document.getElementById('f-nova-senha').value,
  };
  try {
    await api('/api/trocar-senha', { method: 'POST', body: JSON.stringify(body) });
    fecharModal();
    if (obrigatorio) usuarioAtual.precisaTrocarSenha = false;
  } catch (e) {
    const erroEl = document.getElementById('erro-senha');
    erroEl.textContent = e.message;
    erroEl.style.display = 'block';
  }
}

iniciar();
