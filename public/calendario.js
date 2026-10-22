// Calendário no estilo Google Agenda: mês, semana, dia e agenda (lista),
// reunindo eventos, prazos, tarefas e compromissos sincronizados do Google Agenda.
const CAL = {
  modo: 'mes',
  ref: new Date().toISOString().slice(0, 10),
  filtros: { audiencia: true, prazo: true, reuniao: true, pericia: true, google: true, tarefa: true, processo: true, outro: true },
};
const GOOGLE_EMAIL = 'iarafelicio.adv@gmail.com';
const CAL_CORES = { audiencia: '#d93025', prazo: '#e8710a', reuniao: '#1a73e8', pericia: '#8e24aa', google: '#0b8043', tarefa: '#33b679', processo: '#b8860b', outro: '#5f6368' };
const CAL_ROTULOS = { audiencia: 'Audiências', prazo: 'Prazos', reuniao: 'Reuniões', pericia: 'Perícias', google: 'Google Agenda', tarefa: 'Tarefas', processo: 'Prazos de processos', outro: 'Outros' };
const DIAS_CURTOS = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];

function calData(iso) { return new Date(iso + 'T12:00:00'); }
function calIso(d) { return d.toISOString().slice(0, 10); }
function calSomaDias(iso, n) { const d = calData(iso); d.setDate(d.getDate() + n); return calIso(d); }
function calInicioSemana(iso) { return calSomaDias(iso, -calData(iso).getDay()); }
function calHoje() { return new Date().toISOString().slice(0, 10); }
function calHora(h) { return h ? String(h).slice(0, 5) : ''; }

// ---- reúne tudo que aparece na agenda ----
function calItens() {
  const itens = [];
  const classeEvento = (e) => {
    if (e.origem === 'google-agenda') return 'google';
    return { 'Audiência': 'audiencia', 'Prazo': 'prazo', 'Reunião': 'reuniao', 'Perícia': 'pericia' }[e.tipo] || 'outro';
  };
  state.eventos.forEach((e) => {
    if (!e.data) return;
    itens.push({ chave: `evento-${e.id}`, tipo: 'evento', id: e.id, data: e.data, hora: calHora(e.hora), titulo: e.titulo || 'Compromisso', sub: e.tipo || '', classe: classeEvento(e), cumprido: !!e.cumprido, origem: e.origem });
  });
  state.tarefas.filter((t) => t.prazo).forEach((t) => {
    itens.push({ chave: `tarefa-${t.id}`, tipo: 'tarefa', id: t.id, data: t.prazo, hora: '', titulo: t.titulo || 'Tarefa', sub: t.tipoPrazo === 'Fatal' ? 'Tarefa · prazo fatal' : 'Tarefa', classe: 'tarefa', cumprido: t.status === 'Concluída' });
  });
  state.processos.filter((p) => p.prazo && !['Concluído', 'Arquivado', 'Sem êxito'].includes(statusKanban(p))).forEach((p) => {
    itens.push({ chave: `processo-${p.id}`, tipo: 'processo', id: p.id, data: p.prazo, hora: '', titulo: `Prazo: ${p.nome || 'Processo #' + p.id}`, sub: 'Prazo do processo', classe: 'processo', cumprido: !!p.prazoCumprido });
  });
  return itens.filter((i) => CAL.filtros[i.classe] !== false)
    .sort((a, b) => a.data.localeCompare(b.data) || (a.hora || '00:00').localeCompare(b.hora || '00:00') || a.titulo.localeCompare(b.titulo));
}

function calChip(i) {
  const cor = CAL_CORES[i.classe];
  return `<div class="cal-chip ${i.cumprido ? 'cumprido' : ''}" style="--cor:${cor}" onclick="event.stopPropagation(); calDetalhe('${i.chave}')" title="${textoSeguro(i.titulo)}"><span class="cal-chip-dot"></span>${i.hora ? `<b>${i.hora}</b> ` : ''}${textoSeguro(i.titulo)}</div>`;
}

function renderCalendario() {
  const raiz = document.getElementById('cal-raiz');
  if (!raiz) return;
  const hoje = calHoje();
  const ref = CAL.ref;
  const itens = calItens();
  const porDia = {};
  itens.forEach((i) => { (porDia[i.data] = porDia[i.data] || []).push(i); });

  // título e navegação
  let titulo = '';
  if (CAL.modo === 'mes') titulo = calData(ref).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  else if (CAL.modo === 'semana') { const ini = calInicioSemana(ref); const fim = calSomaDias(ini, 6); titulo = `${calData(ini).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} – ${calData(fim).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`; }
  else if (CAL.modo === 'dia') titulo = calData(ref).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  else if (CAL.modo === 'agenda') titulo = 'Próximos compromissos';
  else titulo = 'Google Agenda';
  document.getElementById('cal-titulo').textContent = titulo;
  document.querySelectorAll('.cal-modos button').forEach((b) => b.classList.toggle('ativo', b.dataset.modo === CAL.modo));
  document.getElementById('cal-nav').style.visibility = ['agenda', 'google'].includes(CAL.modo) ? 'hidden' : 'visible';

  // filtros (minhas agendas)
  document.getElementById('cal-filtros').innerHTML = Object.keys(CAL_ROTULOS).map((k) => `<label class="cal-filtro" style="--cor:${CAL_CORES[k]}"><input type="checkbox" ${CAL.filtros[k] !== false ? 'checked' : ''} onchange="CAL.filtros['${k}']=this.checked; renderCalendario()"><span class="cal-check"></span>${CAL_ROTULOS[k]}</label>`).join('');

  let html = '';
  if (CAL.modo === 'mes') {
    const primeiro = ref.slice(0, 8) + '01';
    const ini = calInicioSemana(primeiro);
    const mesAtual = ref.slice(0, 7);
    html += '<div class="cal-mes">' + DIAS_CURTOS.map((d) => `<div class="cal-cab">${d}</div>`).join('');
    for (let n = 0; n < 42; n++) {
      const dia = calSomaDias(ini, n);
      if (n >= 35 && dia.slice(0, 7) !== mesAtual) break;
      const lista = porDia[dia] || [];
      const fora = dia.slice(0, 7) !== mesAtual;
      html += `<div class="cal-cel ${fora ? 'fora' : ''} ${dia === hoje ? 'hoje' : ''}" onclick="abrirModalEvento(null, '${dia}')"><div class="cal-num" onclick="event.stopPropagation(); calIr('dia','${dia}')">${Number(dia.slice(8))}</div>${lista.slice(0, 3).map(calChip).join('')}${lista.length > 3 ? `<div class="cal-mais" onclick="event.stopPropagation(); calIr('dia','${dia}')">+${lista.length - 3} mais</div>` : ''}</div>`;
    }
    html += '</div>';
  } else if (CAL.modo === 'semana' || CAL.modo === 'dia') {
    const dias = CAL.modo === 'semana' ? Array.from({ length: 7 }, (_, n) => calSomaDias(calInicioSemana(ref), n)) : [ref];
    const cols = `56px repeat(${dias.length}, minmax(0, 1fr))`;
    html += `<div class="cal-tempo" style="--cols:${cols}">`;
    html += '<div class="cal-tcab"></div>' + dias.map((d) => `<div class="cal-tcab ${d === hoje ? 'hoje' : ''}" onclick="calIr('dia','${d}')"><span>${DIAS_CURTOS[calData(d).getDay()]}</span><strong>${Number(d.slice(8))}</strong></div>`).join('');
    html += '<div class="cal-hora-rot">dia todo</div>' + dias.map((d) => `<div class="cal-dia-todo" onclick="abrirModalEvento(null, '${d}')">${(porDia[d] || []).filter((i) => !i.hora).map(calChip).join('')}</div>`).join('');
    for (let h = 6; h <= 21; h++) {
      const hh = String(h).padStart(2, '0');
      html += `<div class="cal-hora-rot">${hh}:00</div>` + dias.map((d) => {
        const doHorario = (porDia[d] || []).filter((i) => i.hora && Number(i.hora.slice(0, 2)) === h);
        return `<div class="cal-hora-cel ${d === hoje ? 'hoje' : ''}" onclick="abrirModalEvento(null, '${d}', '${hh}:00')">${doHorario.map(calChip).join('')}</div>`;
      }).join('');
    }
    // eventos fora da faixa 06–21h
    const extras = dias.map((d) => (porDia[d] || []).filter((i) => i.hora && (Number(i.hora.slice(0, 2)) < 6 || Number(i.hora.slice(0, 2)) > 21)));
    if (extras.some((l) => l.length)) html += '<div class="cal-hora-rot">outros</div>' + extras.map((l) => `<div class="cal-dia-todo">${l.map(calChip).join('')}</div>`).join('');
    html += '</div>';
  } else if (CAL.modo === 'agenda') {
    const fim = calSomaDias(hoje, 60);
    const proximos = itens.filter((i) => i.data >= hoje && i.data <= fim);
    const grupos = {};
    proximos.forEach((i) => { (grupos[i.data] = grupos[i.data] || []).push(i); });
    html += '<div class="cal-agenda">' + (Object.keys(grupos).sort().map((d) => `<div class="cal-ag-dia"><div class="cal-ag-data ${d === hoje ? 'hoje' : ''}"><strong>${Number(d.slice(8))}</strong><span>${calData(d).toLocaleDateString('pt-BR', { month: 'short', weekday: 'short' })}</span></div><div class="cal-ag-lista">${grupos[d].map((i) => `<div class="cal-ag-item ${i.cumprido ? 'cumprido' : ''}" style="--cor:${CAL_CORES[i.classe]}" onclick="calDetalhe('${i.chave}')"><span class="cal-ag-hora">${i.hora || 'dia todo'}</span><span class="cal-chip-dot"></span><span class="cal-ag-titulo">${textoSeguro(i.titulo)}</span><small>${textoSeguro(i.sub)}</small></div>`).join('')}</div></div>`).join('') || '<p class="cal-vazio">Nenhum compromisso nos próximos 60 dias.</p>') + '</div>';
  } else {
    html += `<div class="notice">Esta aba mostra o Google Agenda de <strong>${GOOGLE_EMAIL}</strong> exatamente como ele é. Para aparecer, você precisa estar conectada à sua conta Google neste navegador. Os compromissos do Google também já entram nas outras abas pelo sincronismo automático.</div><iframe class="cal-google" src="https://calendar.google.com/calendar/embed?height=700&wkst=1&ctz=America%2FSao_Paulo&showTitle=0&showPrint=0&showTabs=0&showCalendars=0&mode=MONTH&src=${encodeURIComponent(GOOGLE_EMAIL)}" loading="lazy"></iframe>`;
  }
  document.getElementById('cal-corpo').innerHTML = html;
}

function calIr(modo, dia) { CAL.modo = modo; if (dia) CAL.ref = dia; renderCalendario(); }
function calModo(modo) { CAL.modo = modo; renderCalendario(); }
function calHojeBtn() { CAL.ref = calHoje(); renderCalendario(); }
function calMover(dir) {
  if (CAL.modo === 'mes') { const d = calData(CAL.ref.slice(0, 8) + '01'); d.setMonth(d.getMonth() + dir); CAL.ref = calIso(d); }
  else if (CAL.modo === 'semana') CAL.ref = calSomaDias(CAL.ref, 7 * dir);
  else CAL.ref = calSomaDias(CAL.ref, dir);
  renderCalendario();
}

function linkGoogle(i, quando) {
  const ini = i.data.replace(/-/g, '');
  const fim = calSomaDias(i.data, 1).replace(/-/g, '');
  const datas = i.hora ? `${ini}T${i.hora.replace(':', '')}00/${ini}T${String(Number(i.hora.slice(0, 2)) + 1).padStart(2, '0')}${i.hora.slice(3, 5)}00` : `${ini}/${fim}`;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(i.titulo)}&dates=${datas}&ctz=America/Sao_Paulo&details=${encodeURIComponent('Criado pelo CRM — ' + (i.sub || ''))}`;
}

function calDetalhe(chave) {
  const i = calItens().concat(calItensTodos()).find((x) => x.chave === chave);
  if (!i) return;
  const proc = i.tipo === 'evento' ? (state.eventos.find((e) => e.id === i.id) || {}).processoId : (i.tipo === 'tarefa' ? (state.tarefas.find((t) => t.id === i.id) || {}).processoId : i.id);
  const quando = `${dataBr(i.data)}${i.hora ? ' às ' + i.hora : ' · dia todo'}`;
  const ehPrazoEvento = i.tipo === 'evento' && i.sub === 'Prazo';
  const acoes = [];
  if (i.tipo === 'evento' && i.origem !== 'google-agenda') acoes.push(`<button class="btn-primary" onclick="abrirModalEvento(${i.id})">Editar</button>`);
  if (i.tipo === 'tarefa') acoes.push(`<button class="btn-primary" onclick="editarTarefa(${i.id})">Abrir tarefa</button>`);
  if (i.tipo === 'processo') acoes.push(`<button class="btn-primary" onclick="abrirModalProcesso(${i.id})">Abrir processo</button>`);
  if (ehPrazoEvento) acoes.push(i.cumprido ? `<button class="btn-secondary" onclick="desfazerOkPrazo('evento', ${i.id})">↩ Desfazer ok</button>` : `<button class="btn-secondary" onclick="darOkPrazo('evento', ${i.id})">✓ Dar ok no prazo</button>`);
  if (i.tipo === 'processo') acoes.push(i.cumprido ? `<button class="btn-secondary" onclick="desfazerOkPrazo('processo', ${i.id})">↩ Desfazer ok</button>` : `<button class="btn-secondary" onclick="darOkPrazo('processo', ${i.id})">✓ Dar ok no prazo</button>`);
  if (i.origem !== 'google-agenda') acoes.push(`<a class="btn-secondary" style="text-decoration:none;display:inline-block" target="_blank" rel="noopener" href="${linkGoogle(i)}">+ Google Agenda</a>`);
  modalBox.innerHTML = `<h3><span class="cal-chip-dot" style="--cor:${CAL_CORES[i.classe]};display:inline-block;margin-right:8px"></span>${textoSeguro(i.titulo)}</h3><p><strong>${quando}</strong></p><p>${textoSeguro(i.sub)}${i.origem === 'google-agenda' ? ' · vindo do Google Agenda' : ''}</p>${proc ? `<p>Processo: <strong>${textoSeguro(nomeProcesso(proc))}</strong>${state.processos.find((p) => p.id === proc) ? ' · ' + textoSeguro(nomeCliente((state.processos.find((p) => p.id === proc) || {}).clienteId)) : ''}</p>` : ''}${i.cumprido ? '<p style="color:#227a3d">✓ Concluído / cumprido</p>' : ''}<div class="modal-actions">${acoes.join(' ')}<button class="btn-secondary" onclick="fecharModal()">Fechar</button></div>`;
  overlay.classList.add('active');
}
// itens sem filtro, para o detalhe abrir mesmo se a categoria estiver oculta
function calItensTodos() {
  const guardado = { ...CAL.filtros };
  Object.keys(CAL.filtros).forEach((k) => { CAL.filtros[k] = true; });
  const todos = calItens();
  CAL.filtros = guardado;
  return todos;
}
