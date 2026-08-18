const STATUSES = ['Triagem', 'Pré-contencioso', 'Em Andamento', 'Aguardando', 'Em recurso', 'Cumprimento', 'Arquivado', 'Sem êxito', 'Novo', 'Concluído'];
const AREAS = ['Cível', 'Trabalhista', 'Família', 'Criminal', 'Tributário', 'Previdenciário', 'Outro'];
const TIPOS_PROCESSO = ['Ação Ordinária', 'CPD', 'Mandado de Segurança', 'Execução', 'Outro'];
const TIPOS_EVENTO = ['Audiência', 'Prazo', 'Reunião', 'Perícia', 'Outro'];
const TIPOS_DOC = ['Petição', 'Procuração', 'Contrato', 'Documento Pessoal', 'Prova', 'Outro'];
const ETAPAS_LEAD = ['Novo lead', 'Em contato', 'Qualificado', 'Reunião', 'Proposta', 'Contrato', 'Aguardando documentos', 'Cliente ativo', 'Follow-up', 'Perdido'];
const STATUS_TAREFA = ['A fazer', 'Em execução', 'Aguardando revisão', 'Concluída'];

let state = { clientes: [], processos: [], eventos: [], documentos: [], checklistTemplates: [], usuarios: [], leads: [], tarefas: [], publicacoes: [], contratos: [], pagamentos: [], controladoria: { resumo: {}, itens: [] }, financeiro: {}, whatsapp: {}, zapsign: {} };
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
    api('/api/controladoria'),
    api('/api/financeiro'),
    api('/api/whatsapp/status'),
    api('/api/integracoes/zapsign/status'),
  ];
  if (usuarioAtual && usuarioAtual.role === 'admin') chamadas.push(api('/api/usuarios'));
  const resultados = await Promise.all(chamadas);
  const [clientes, processos, eventos, documentos, dashboard, checklistTemplates, leads, tarefas, publicacoes, contratos, pagamentos, controladoria, financeiro, whatsapp, zapsign] = resultados;
  const usuarios = usuarioAtual && usuarioAtual.role === 'admin' ? resultados[15] : [];
  state = { clientes, processos, eventos, documentos, dashboard, checklistTemplates, leads, tarefas, publicacoes, contratos, pagamentos, controladoria, financeiro, whatsapp, zapsign, usuarios: usuarios || [] };
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
  const resumo = (itens) => itens.map((t) => `<div class="tarefa-resumo"><strong>${t.titulo}</strong>${t.prazo ? ` · ${dataBr(t.prazo)}` : ''}</div>`).join('') || '<span class="card-label">Nenhuma tarefa.</span>';
  const hojeEl = document.getElementById('tarefas-hoje');
  const amanhaEl = document.getElementById('tarefas-amanha');
  if (hojeEl) hojeEl.innerHTML = resumo(d.tarefasHoje || []);
  if (amanhaEl) amanhaEl.innerHTML = resumo(d.tarefasAmanha || []);
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
      <td><button class="btn-icon" title="Excluir" onclick="excluir('documentos', ${d.id})">🗑️</button></td>
    </tr>`).join('') || '<tr><td colspan="6">Nenhum documento cadastrado ainda.</td></tr>';
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
    return `<tr><td>${t.titulo}</td><td>${t.processoId ? nomeProcesso(t.processoId) : '—'}</td><td>${dataBr(t.prazo)} ${t.tipoPrazo === 'Fatal' ? '<span class="badge status-Aguardando">fatal</span>' : ''}</td><td>${t.prioridade || 'Média'}</td><td>${t.status || 'A fazer'}</td><td>${t.evidencia || '—'}</td><td>${acao}<button class="btn-icon" onclick="excluir('tarefas', ${t.id})">🗑️</button></td></tr>`;
  }).join('') || '<tr><td colspan="7">Nenhuma tarefa cadastrada.</td></tr>';
}

function renderPublicacoes() {
  const tbody = document.querySelector('#tabela-publicacoes tbody');
  if (!tbody) return;
  tbody.innerHTML = state.publicacoes.map((p) => `<tr><td>${dataBr(p.dataPublicacao)}</td><td>${p.processoId ? nomeProcesso(p.processoId) : `<span class="badge risco-critico">Não conciliado${p.numeroProcesso ? ` · ${p.numeroProcesso}` : ''}</span>`}</td><td>${p.descricao}</td><td>${dataBr(p.prazoFatal)}</td><td>${p.status}</td><td>${p.status === 'Nova' && p.processoId ? `<button class="btn-primary btn-small" onclick="criarTarefaPublicacao(${p.id})">Criar tarefa</button>` : (p.status === 'Nova' ? 'Vincule o processo' : '✓')}</td></tr>`).join('') || '<tr><td colspan="6">Nenhuma publicação registrada.</td></tr>';
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
  document.getElementById('fin-contratado').textContent = moeda(f.totalContratado);
  document.getElementById('fin-taxas').textContent = moeda(f.totalTaxasCartao);
  document.getElementById('fin-liquido').textContent = moeda(f.totalLiquidoPrevisto);
  document.getElementById('fin-recebido').textContent = moeda(f.totalRecebido);
  document.getElementById('fin-receber').textContent = moeda(f.aReceber);
  document.getElementById('fin-vencido').textContent = moeda(f.vencido);
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
    return `<tr><td>${nomeCliente(c.clienteId)}</td><td><strong>${c.descricao}</strong><div class="contract-links">${links}</div></td><td>${c.numeroParcelasCliente || 1}× ${moeda(c.valorParcelaCliente)}</td><td>${moeda(c.valorTotal)}${c.honorarioExitoPercentual ? `<br><small>+ ${c.honorarioExitoPercentual}% de êxito</small>` : ''}</td><td>${moeda(c.valorLiquidoPrevisto)}<br><small>tarifas: ${moeda(c.taxaCartaoValor)}</small></td><td>${dataBr(c.proximoVencimento)}<br><small>${moeda(c.proximaParcelaValor)}</small><br><span class="badge ${c.vencido ? 'risco-critico' : 'risco-baixo'}">${situacao}</span></td><td>${assinatura}</td><td><button class="btn-secondary btn-small" onclick="verContrato(${c.id})">Detalhes</button></td></tr>`;
  }).join('') || '<tr><td colspan="8">Nenhum contrato cadastrado.</td></tr>';
  document.querySelector('#tabela-pagamentos-soltos tbody').innerHTML = (f.pagamentosSemContrato || []).map((p) => `<tr><td>${dataBr(p.data)}</td><td>${p.descricao || 'Recebimento'}</td><td>${moeda(p.valor)}</td></tr>`).join('') || '<tr><td colspan="3">Nenhum recebimento sem contrato.</td></tr>';
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
  modalBox.innerHTML = `<h3>Novo Lead</h3><label>Nome</label><input id="f-nome"><label>Telefone / WhatsApp</label><input id="f-telefone"><label>Origem</label><input id="f-origem" placeholder="Ex.: indicação, Instagram"><label>Etapa</label><select id="f-etapa">${opcoesLista(ETAPAS_LEAD, 'Novo lead')}</select><div class="modal-actions"><button class="btn-secondary" onclick="fecharModal()">Cancelar</button><button class="btn-primary" onclick="salvarLead()">Salvar</button></div>`;
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

function abrirModalTarefa() {
  modalBox.innerHTML = `<h3>Nova Tarefa</h3><label>Título</label><input id="f-titulo"><label>Processo</label><select id="f-processo">${opcoesProcessos()}</select><label>Prazo</label><input type="date" id="f-prazo"><label>Tipo de prazo</label><select id="f-tipo-prazo"><option>Interno</option><option>Fatal</option></select><label>Prioridade</label><select id="f-prioridade"><option>Alta</option><option selected>Média</option><option>Baixa</option></select><label>Status</label><select id="f-status-tarefa">${opcoesLista(STATUS_TAREFA, 'A fazer')}</select><div class="modal-actions"><button class="btn-secondary" onclick="fecharModal()">Cancelar</button><button class="btn-primary" onclick="salvarTarefa()">Salvar</button></div>`;
  overlay.classList.add('active');
}
async function salvarTarefa() {
  await api('/api/tarefas', { method:'POST', body:JSON.stringify({ titulo:document.getElementById('f-titulo').value, processoId:Number(document.getElementById('f-processo').value)||null, prazo:document.getElementById('f-prazo').value, tipoPrazo:document.getElementById('f-tipo-prazo').value, prioridade:document.getElementById('f-prioridade').value, status:document.getElementById('f-status-tarefa').value, responsavelId:usuarioAtual.id }) });
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
  modalBox.innerHTML = `<h3>Novo contrato de honorários</h3><label>Cliente</label><select id="f-cliente"><option value="">— selecione —</option>${opcoesClientes()}</select><label>Processo (opcional)</label><select id="f-processo">${opcoesProcessos()}</select><label>Descrição</label><input id="f-descricao" placeholder="Ex.: Honorários ação previdenciária"><label>Tipo de honorário</label><select id="f-tipo-honorario"><option>Fixo</option><option>Êxito</option><option selected>Misto</option></select><h4>Condição oferecida à cliente</h4><label>Valor bruto contratado</label><input id="f-valor" type="number" min="0" step="0.01" oninput="recalcularContratoCartao()"><label>Parcelas da cliente</label><input id="f-parcelas-cliente" type="number" min="1" step="1" value="1" oninput="recalcularContratoCartao()"><label>Valor de cada parcela</label><input id="f-valor-parcela-cliente" type="number" min="0" step="0.01"><label>Forma de pagamento</label><select id="f-forma-pagamento"><option>Cartão de crédito</option><option>PIX</option><option>Boleto</option><option>Transferência</option><option>Dinheiro</option><option>Outro</option></select><h4>Repasse ao escritório</h4><div class="notice">Informe o valor líquido e a data mostrados no extrato da operadora. O parcelamento da cliente não será tratado como recebimento mensal do escritório.</div><label>Tarifas descontadas pela operadora</label><input id="f-taxa-cartao" type="number" min="0" step="0.01" oninput="recalcularContratoCartao('taxa')"><label>Valor líquido previsto em 1 repasse</label><input id="f-liquido-previsto" type="number" min="0" step="0.01" oninput="recalcularContratoCartao('liquido')"><label>Data prevista do repasse</label><input id="f-data-repasse" type="date"><label>Data do contrato</label><input id="f-data-contrato" type="date"><label>Honorários de êxito (%)</label><input id="f-exito" type="number" min="0" max="100" step="0.01"><label>Base dos honorários de êxito</label><input id="f-base-exito" placeholder="Ex.: valor da causa e eventual multa"><label>Link permanente do contrato assinado no Drive</label><input id="f-drive-url" type="url" placeholder="https://drive.google.com/..."><label>Identificador do documento na ZapSign</label><input id="f-zapsign-token" placeholder="Token/UUID do documento"><label>Status da assinatura</label><select id="f-zapsign-status"><option>Aguardando assinatura</option><option>Assinado</option><option>Recusado</option><option>Expirado</option></select><label>Status financeiro</label><select id="f-status"><option>Ativo</option><option>Quitado</option><option>Cancelado</option></select><div class="modal-actions"><button class="btn-secondary" onclick="fecharModal()">Cancelar</button><button class="btn-primary" onclick="salvarContrato()">Salvar contrato</button></div>`;
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
    await api('/api/contratos', { method:'POST', body:JSON.stringify({ clienteId:Number(document.getElementById('f-cliente').value)||null, processoId:Number(document.getElementById('f-processo').value)||null, descricao:document.getElementById('f-descricao').value, tipoHonorario:document.getElementById('f-tipo-honorario').value, valorTotal:Number(document.getElementById('f-valor').value), numeroParcelasCliente:Number(document.getElementById('f-parcelas-cliente').value)||1, valorParcelaCliente:Number(document.getElementById('f-valor-parcela-cliente').value)||0, formaPagamento:document.getElementById('f-forma-pagamento').value, numeroRepasses:1, taxaCartaoValor:Number(document.getElementById('f-taxa-cartao').value)||0, valorLiquidoPrevisto:Number(document.getElementById('f-liquido-previsto').value)||0, dataPrimeiroRepasse:document.getElementById('f-data-repasse').value||null, dataContrato:document.getElementById('f-data-contrato').value||null, honorarioExitoPercentual:Number(document.getElementById('f-exito').value)||0, honorarioExitoBase:document.getElementById('f-base-exito').value, documentoDriveUrl:document.getElementById('f-drive-url').value||null, zapsignToken:document.getElementById('f-zapsign-token').value||null, zapsignStatus:document.getElementById('f-zapsign-status').value, status:document.getElementById('f-status').value }) });
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
async function salvarPagamento() {
  try {
    await api('/api/pagamentos', { method:'POST', body:JSON.stringify({ contratoId:Number(document.getElementById('f-contrato').value)||null, data:document.getElementById('f-data').value, valor:Number(document.getElementById('f-valor').value), descricao:document.getElementById('f-descricao').value }) });
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
    <label>Status</label><select id="f-status">${opcoesLista(STATUSES, p.status || 'Triagem')}</select>
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
