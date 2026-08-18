const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const cookieSession = require('cookie-session');
const { load, save, nextId, salvarArquivo, buscarArquivo, removerArquivo } = require('./db');
const { configuracaoDriveValida, criarDrivePeloAmbiente } = require('./google-drive');
const { calcularFinanceiro, normalizarContrato } = require('./financeiro');
const { aplicarEventoZapSign, segredoValido, confirmarEventoZapSignPorApi } = require('./zapsign');
const {
  aplicarWebhookWhatsApp,
  assinaturaValida,
  configuracaoEnvioValida,
  enviarMensagemTexto,
  registrarMensagemSaida,
} = require('./whatsapp');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({
  limit: '15mb',
  verify: (req, res, buffer) => {
    req.rawBody = Buffer.from(buffer);
  },
}));

app.use(
  cookieSession({
    name: 'crmSession',
    secret: process.env.SESSION_SECRET || 'troque-este-segredo-em-producao-dev',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
  })
);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

async function ensureAdminSeed() {
  const db = await load();
  if (!db.usuarios) db.usuarios = [];
  if (db.usuarios.length === 0) {
    const email = process.env.ADMIN_EMAIL || 'iarafelicio.adv@gmail.com';
    const senhaInicial = process.env.ADMIN_INITIAL_PASSWORD || crypto.randomBytes(6).toString('hex');
    const admin = {
      id: nextId(db.usuarios),
      nome: 'Iara Vieira Felício',
      email,
      role: 'admin',
      senhaHash: bcrypt.hashSync(senhaInicial, 10),
      precisaTrocarSenha: true,
      criadoEm: new Date().toISOString(),
    };
    db.usuarios.push(admin);
    await save(db);
    console.log('=== Usuário admin inicial criado ===');
    console.log('E-mail:', email);
    if (!process.env.ADMIN_INITIAL_PASSWORD) console.log('Senha temporária:', senhaInicial);
    console.log('=====================================');
  }
}

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.status(401).json({ erro: 'não autenticado' });
}
function requireAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') return next();
  res.status(403).json({ erro: 'apenas administradores podem fazer isso' });
}

function auditar(req, db, acao, recurso, item, detalhes) {
  if (!db.auditoria) db.auditoria = [];
  const usuario = (db.usuarios || []).find((u) => u.id === req.session.userId);
  db.auditoria.push({
    id: nextId(db.auditoria),
    usuarioId: req.session.userId || null,
    usuarioNome: usuario ? usuario.nome : 'Sistema',
    acao,
    recurso,
    recursoId: item && item.id ? item.id : null,
    detalhes: detalhes || '',
    criadoEm: new Date().toISOString(),
  });
  if (db.auditoria.length > 1000) db.auditoria = db.auditoria.slice(-1000);
}

let driveCRMCache = null;
function obterDriveCRM() {
  if (!configuracaoDriveValida()) return null;
  if (!driveCRMCache) driveCRMCache = criarDrivePeloAmbiente();
  return driveCRMCache;
}

async function garantirPastaDriveCliente(cliente) {
  const drive = obterDriveCRM();
  if (!drive) {
    cliente.driveSyncStatus = 'Pendente de configuração';
    cliente.driveSyncErro = null;
    return null;
  }
  try {
    const pasta = await drive.garantirPastaCliente(cliente.nome, cliente.id);
    cliente.driveFolderId = pasta.id;
    cliente.driveFolderUrl = pasta.webViewLink || null;
    cliente.driveEstrutura = pasta.estrutura || cliente.driveEstrutura || null;
    cliente.driveSyncStatus = 'Sincronizado';
    cliente.driveSyncErro = null;
    cliente.driveSincronizadoEm = new Date().toISOString();
    return pasta;
  } catch (erro) {
    cliente.driveSyncStatus = 'Pendente';
    cliente.driveSyncErro = String(erro.message || 'Falha ao criar a pasta no Drive').slice(0, 300);
    return null;
  }
}

async function sincronizarDocumentoDrive(cliente, documento, buffer, mimetype) {
  const drive = obterDriveCRM();
  if (!drive) {
    documento.driveSyncStatus = 'Pendente de configuração';
    documento.driveSyncErro = null;
    return null;
  }
  const pasta = cliente.driveFolderId ? { id: cliente.driveFolderId } : await garantirPastaDriveCliente(cliente);
  if (!pasta) {
    documento.driveSyncStatus = 'Pendente';
    documento.driveSyncErro = cliente.driveSyncErro || 'A pasta da cliente ainda não está disponível no Drive';
    return null;
  }
  try {
    const arquivo = await drive.enviarDocumento({
      pastaId: pasta.id,
      documentoId: documento.id,
      nome: documento.nome,
      nomeOriginal: documento.nomeOriginal || documento.nome,
      nomeCliente: cliente.nome,
      categoriaPOP: documento.categoriaPOP || null,
      mimetype,
      buffer,
    });
    documento.driveFileId = arquivo.id;
    documento.driveFileUrl = arquivo.webViewLink || null;
    documento.driveNomeFinal = arquivo.name || null;
    documento.driveOriginalId = arquivo.originalId || null;
    documento.driveOriginalUrl = arquivo.originalUrl || null;
    documento.driveConversaoStatus = arquivo.conversaoStatus || null;
    documento.driveSyncStatus = 'Sincronizado';
    documento.driveSyncErro = null;
    documento.driveSincronizadoEm = new Date().toISOString();
    return arquivo;
  } catch (erro) {
    documento.driveSyncStatus = 'Pendente';
    documento.driveSyncErro = String(erro.message || 'Falha ao copiar o documento para o Drive').slice(0, 300);
    return null;
  }
}

app.post('/api/login', async (req, res) => {
  const db = await load();
  const { email, senha } = req.body;
  const user = (db.usuarios || []).find((u) => u.email.toLowerCase() === String(email || '').toLowerCase());
  if (!user || !bcrypt.compareSync(String(senha || ''), user.senhaHash)) {
    return res.status(401).json({ erro: 'e-mail ou senha inválidos' });
  }
  req.session.userId = user.id;
  req.session.role = user.role;
  res.json({ ok: true, nome: user.nome, role: user.role, precisaTrocarSenha: !!user.precisaTrocarSenha });
});

app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

// ---------- sincronização automática (Google Drive / Google Agenda) ----------
function requireSyncKey(req, res, next) {
  const chave = req.headers['x-sync-key'];
  if (!process.env.SYNC_API_KEY || chave !== process.env.SYNC_API_KEY) {
    return res.status(401).json({ erro: 'chave de sincronização inválida' });
  }
  next();
}

function mapStatusPlanilha(statusTexto) {
  const s = String(statusTexto || '').toLowerCase();
  if (s.includes('conclu')) return 'Concluído';
  if (s.includes('sentença') || s.includes('sentenca') || s.includes('aguard')) return 'Aguardando';
  if (s.includes('inicial') || s.includes('novo')) return 'Novo';
  return 'Em Andamento';
}

function mapAreaPlanilha(acaoTexto) {
  const a = String(acaoTexto || '').toLowerCase();
  if (a.includes('previdenci') || a.includes('inss') || a.includes('benefício')) return 'Previdenciário';
  if (a.includes('trabalh')) return 'Trabalhista';
  if (a.includes('família') || a.includes('familia') || a.includes('divórcio') || a.includes('divorcio')) return 'Família';
  if (a.includes('crime') || a.includes('criminal')) return 'Criminal';
  if (a.includes('tribut')) return 'Tributário';
  return 'Cível';
}

app.post('/api/sync/clientes-processos', requireSyncKey, async (req, res) => {
  const db = await load();
  const registros = Array.isArray(req.body.registros) ? req.body.registros : [];
  let clientesCriados = 0;
  let clientesAtualizados = 0;
  let processosCriados = 0;
  let processosAtualizados = 0;

  registros.forEach((r) => {
    if (!r.cliente) return;
    let cliente = db.clientes.find((c) => c.nome && c.nome.trim().toLowerCase() === String(r.cliente).trim().toLowerCase());
    if (!cliente) {
      cliente = { id: nextId(db.clientes), nome: r.cliente, criadoEm: new Date().toISOString() };
      db.clientes.push(cliente);
      clientesCriados++;
    } else {
      clientesAtualizados++;
    }

    if (r.numero || r.acao) {
      let processo = null;
      if (r.numero) processo = db.processos.find((p) => p.numeroProcesso === r.numero);
      if (!processo && r.acao) processo = db.processos.find((p) => p.nome === r.acao && p.clienteId === cliente.id);

      const dadosProcesso = {
        nome: r.acao || r.numero || 'Processo',
        numeroProcesso: r.numero || null,
        clienteId: cliente.id,
        area: mapAreaPlanilha(r.acao),
        tipo: 'Ação Ordinária',
        status: mapStatusPlanilha(r.status),
        pastaDocumentos: r.pastaDocumentos || null,
      };

      if (!processo) {
        processo = { id: nextId(db.processos), criadoEm: new Date().toISOString(), ...dadosProcesso };
        db.processos.push(processo);
        processosCriados++;
      } else {
        Object.assign(processo, dadosProcesso);
        processosAtualizados++;
      }
    }
  });

  await save(db);
  res.json({ clientesCriados, clientesAtualizados, processosCriados, processosAtualizados });
});

app.post('/api/sync/documento', requireSyncKey, async (req, res) => {
  const db = await load();
  const { pastaDocumentos, nomeOriginal, tipo, conteudoBase64, mimetype } = req.body;
  if (!pastaDocumentos || !nomeOriginal || !conteudoBase64) {
    return res.status(400).json({ erro: 'pastaDocumentos, nomeOriginal e conteudoBase64 são obrigatórios' });
  }

  const processo = db.processos.find((p) => p.pastaDocumentos && p.pastaDocumentos.trim().toLowerCase() === String(pastaDocumentos).trim().toLowerCase());
  if (!processo) {
    return res.status(404).json({ erro: 'nenhum processo vinculado a essa pasta de documentos' });
  }

  const jaExiste = db.documentos.find((d) => d.processoId === processo.id && d.nomeOriginal === nomeOriginal);
  if (jaExiste) {
    return res.json({ ignorado: true, motivo: 'documento já importado anteriormente' });
  }

  const buffer = Buffer.from(conteudoBase64, 'base64');
  const idArquivo = await salvarArquivo(buffer, nomeOriginal, mimetype);

  const item = {
    id: nextId(db.documentos),
    nome: nomeOriginal,
    clienteId: processo.clienteId,
    processoId: processo.id,
    tipo: tipo || 'Outro',
    arquivo: '/uploads/' + idArquivo,
    nomeOriginal,
    criadoEm: new Date().toISOString(),
    origem: 'sync-drive',
  };
  db.documentos.push(item);
  await save(db);
  res.status(201).json({ id: item.id });
});

// Sincroniza eventos do Google Agenda para o Calendário do CRM.
app.post('/api/sync/calendario', requireSyncKey, async (req, res) => {
  const db = await load();
  const eventosGoogle = Array.isArray(req.body.eventos) ? req.body.eventos : [];
  let criados = 0;
  let atualizados = 0;

  eventosGoogle.forEach((e) => {
    if (!e.googleEventId || !e.data) return;
    let evento = db.eventos.find((ev) => ev.googleEventId === e.googleEventId);
    const dados = {
      titulo: e.titulo || 'Compromisso',
      data: e.data,
      hora: e.hora || null,
      tipo: e.tipo || 'Compromisso',
      processoId: e.processoId || null,
      googleEventId: e.googleEventId,
      origem: 'google-agenda',
    };
    if (!evento) {
      evento = { id: nextId(db.eventos), criadoEm: new Date().toISOString(), ...dados };
      db.eventos.push(evento);
      criados++;
    } else {
      Object.assign(evento, dados);
      atualizados++;
    }
  });

  // remove da lista os eventos vindos da Agenda que não vieram mais nesta sincronização
  // (ou seja, foram apagados/cancelados no Google Agenda) — só afeta eventos com origem google-agenda.
  if (req.body.idsAtuais && Array.isArray(req.body.idsAtuais)) {
    const idsAtuais = new Set(req.body.idsAtuais);
    db.eventos = db.eventos.filter((ev) => ev.origem !== 'google-agenda' || idsAtuais.has(ev.googleEventId));
  }

  await save(db);
  res.json({ criados, atualizados });
});

// ---------- WhatsApp Business Platform (Cloud API oficial da Meta) ----------
// A Meta chama esta rota por GET uma única vez para confirmar a propriedade do
// endpoint. O token é um segredo definido na Render e repetido no painel Meta.
app.get('/webhooks/whatsapp', (req, res) => {
  const modo = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const desafio = req.query['hub.challenge'];
  if (modo === 'subscribe' && process.env.WHATSAPP_VERIFY_TOKEN && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(String(desafio || ''));
  }
  return res.sendStatus(403);
});

// Mensagens reais só são processadas quando a assinatura HMAC confere com o
// App Secret. Assim uma chamada forjada não consegue criar leads no escritório.
app.post('/webhooks/whatsapp', async (req, res) => {
  if (!process.env.WHATSAPP_APP_SECRET) {
    return res.status(503).json({ erro: 'integração WhatsApp ainda não configurada' });
  }
  if (!assinaturaValida(req.rawBody, req.headers['x-hub-signature-256'], process.env.WHATSAPP_APP_SECRET)) {
    return res.sendStatus(401);
  }
  try {
    const db = await load();
    const resultado = aplicarWebhookWhatsApp(db, req.body);
    if (!db.integracoes) db.integracoes = {};
    db.integracoes.whatsapp = {
      ...(db.integracoes.whatsapp || {}),
      ultimoWebhookEm: new Date().toISOString(),
    };
    await save(db);
    return res.status(200).json({ recebido: true });
  } catch (erro) {
    console.error('Erro ao processar webhook do WhatsApp:', erro);
    return res.sendStatus(500);
  }
});

// ---------- Rotina Documental (checklists por tipo de caso + envio pelo cliente) ----------
const { CHECKLIST_TEMPLATES, TEMPLATE_POR_ID, ITEM_POR_CODIGO, CODIGOS_VALIDOS } = require('./checklists');
const uploadRotina = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Tipos de caso ativos de um cliente. Se o cliente ainda não teve nenhum tipo de caso
// escolhido (clientes cadastrados antes desta funcionalidade), cai no checklist Genérico,
// mantendo o comportamento anterior.
function tiposCasoAtivos(cliente) {
  const tipos = Array.isArray(cliente.tiposCaso) ? cliente.tiposCaso.filter((id) => TEMPLATE_POR_ID[id]) : [];
  return tipos.length ? tipos : ['GEN'];
}

// Monta o checklist completo de um cliente, combinando os itens de todos os tipos de
// caso escolhidos para ele, e marcando quais foram SOLICITADOS (cliente.documentosSolicitados
// — se vazio/ausente, considera todos solicitados, para manter compatibilidade com clientes
// já cadastrados) e quais já foram ENVIADOS pelo cliente.
function checklistCompleto(db, cliente) {
  const enviados = db.documentos.filter((d) => d.clienteId === cliente.id && d.categoriaPOP);
  const lista = Array.isArray(cliente.documentosSolicitados) ? cliente.documentosSolicitados : [];
  const setSolicitados = lista.length ? new Set(lista) : null;
  const tipos = tiposCasoAtivos(cliente);
  const itens = [];
  for (const tipoId of tipos) {
    const template = TEMPLATE_POR_ID[tipoId];
    if (!template) continue;
    for (const item of template.itens) {
      const doc = enviados.find((d) => d.categoriaPOP === item.codigo);
      itens.push({
        ...item,
        templateId: template.id,
        templateTitulo: template.titulo,
        solicitado: setSolicitados ? setSolicitados.has(item.codigo) : true,
        enviado: !!doc,
        documentoId: doc ? doc.id : null,
        arquivo: doc ? doc.arquivo : null,
        nomeOriginal: doc ? doc.nomeOriginal : null,
        enviadoEm: doc ? doc.criadoEm : null,
      });
    }
  }
  return itens;
}

// Orientações de relato dos tipos de caso ativos de um cliente (para exibir na página
// pública, orientando o que o cliente deve contar sobre a situação dele).
function orientacoesRelato(cliente) {
  return tiposCasoAtivos(cliente)
    .map((id) => TEMPLATE_POR_ID[id])
    .filter((t) => t && t.orientacaoRelato)
    .map((t) => ({ titulo: t.titulo, texto: t.orientacaoRelato }));
}

// Público: dados do cliente + checklist, a partir do link enviado ao cliente (sem login)
// O link é gerado por CLIENTE (não por processo), pois o processo só é criado depois que
// toda a documentação for reunida. Só mostra ao cliente os documentos SOLICITADOS.
app.get('/api/publico/rotina/:token', async (req, res) => {
  const db = await load();
  const cliente = db.clientes.find((c) => c.uploadToken === req.params.token);
  if (!cliente) return res.status(404).json({ erro: 'link inválido ou expirado' });
  res.json({
    clienteNome: cliente.nome || '',
    orientacoes: orientacoesRelato(cliente),
    checklist: checklistCompleto(db, cliente).filter((item) => item.solicitado),
  });
});

// Público: recebe os arquivos enviados pelo cliente pelo link
app.post('/api/publico/rotina/:token/upload', uploadRotina.any(), async (req, res) => {
  const db = await load();
  const cliente = db.clientes.find((c) => c.uploadToken === req.params.token);
  if (!cliente) return res.status(404).json({ erro: 'link inválido ou expirado' });

  let salvos = 0;
  const documentosNovos = [];
  for (const file of req.files || []) {
    const codigo = file.fieldname;
    if (!CODIGOS_VALIDOS.has(codigo)) continue;
    const item = ITEM_POR_CODIGO[codigo];
    const idArquivo = await salvarArquivo(file.buffer, file.originalname, file.mimetype);
    const doc = {
      id: nextId(db.documentos),
      nome: item.rotulo,
      clienteId: cliente.id,
      processoId: null,
      tipo: item.rotulo,
      categoriaPOP: codigo,
      arquivo: '/uploads/' + idArquivo,
      nomeOriginal: file.originalname,
      criadoEm: new Date().toISOString(),
      origem: 'cliente-rotina',
      visto: false,
    };
    db.documentos.push(doc);
    documentosNovos.push({ doc, file });
    salvos++;
  }
  await save(db);
  for (const { doc, file } of documentosNovos) {
    await sincronizarDocumentoDrive(cliente, doc, file.buffer, file.mimetype);
  }
  if (documentosNovos.length) await save(db);
  res.json({ ok: true, salvos, sincronizadosDrive: documentosNovos.filter(({ doc }) => doc.driveSyncStatus === 'Sincronizado').length });
});

// A ZapSign chama esta rota sem a sessão do CRM. O segredo é configurado como
// cabeçalho personalizado no webhook e nunca é devolvido pela aplicação.
app.post('/api/integracoes/zapsign/webhook', async (req, res) => {
  const segredo = process.env.ZAPSIGN_WEBHOOK_SECRET;
  const db = await load();
  const cabecalhoValido = segredo && segredoValido(req.get('x-zapsign-secret'), segredo);
  let payloadConfiavel = req.body;
  let verificadoPor = 'cabeçalho seguro';

  // O painel web da ZapSign nem sempre oferece cabeçalhos personalizados.
  // Nesse caso, o CRM consulta o documento diretamente na API oficial antes
  // de aceitar qualquer alteração de status recebida pelo webhook.
  if (!cabecalhoValido) {
    const confirmacao = await confirmarEventoZapSignPorApi(
      req.body,
      db.contratos,
      process.env.ZAPSIGN_API_TOKEN
    );
    if (!confirmacao.confirmado) {
      const status = confirmacao.tentarNovamente ? 502 : 200;
      return res.status(status).json({ recebido: true, aplicado: false, motivo: confirmacao.motivo });
    }
    payloadConfiavel = confirmacao.payload;
    verificadoPor = 'API oficial da ZapSign';
  }

  const resultado = aplicarEventoZapSign(db, payloadConfiavel);
  if (resultado.aplicado) {
    if (!db.auditoria) db.auditoria = [];
    db.auditoria.push({
      id: nextId(db.auditoria), usuarioId: null, usuarioNome: 'ZapSign', acao: 'atualizou assinatura',
      recurso: 'contratos', recursoId: resultado.contrato.id,
      detalhes: `${resultado.evento.evento}: ${resultado.evento.status || 'sem status'}`,
      criadoEm: new Date().toISOString(),
    });
    await save(db);
  }
  // Eventos sem contrato correspondente também recebem 200 para não criar
  // uma fila infinita de novas tentativas na ZapSign.
  res.json({ recebido: true, aplicado: resultado.aplicado, verificadoPor });
});

app.use('/api', requireAuth);

app.get('/api/integracoes/zapsign/status', async (req, res) => {
  const db = await load();
  const integracao = (db.integracoes && db.integracoes.zapsign) || {};
  res.json({
    receptorPronto: true,
    webhookConfigurado: !!process.env.ZAPSIGN_WEBHOOK_SECRET,
    apiConfigurada: !!process.env.ZAPSIGN_API_TOKEN,
    ultimoWebhookEm: integracao.ultimoWebhookEm || null,
    ultimoEvento: integracao.ultimoEvento || null,
  });
});

app.post('/api/integracoes/zapsign/contratos/:id/sincronizar', async (req, res) => {
  if (!process.env.ZAPSIGN_API_TOKEN) return res.status(503).json({ erro: 'adicione o token da API da ZapSign na Render' });
  const db = await load();
  const contrato = (db.contratos || []).find((c) => c.id === Number(req.params.id));
  if (!contrato) return res.status(404).json({ erro: 'contrato não encontrado' });
  if (!contrato.zapsignToken) return res.status(400).json({ erro: 'informe o token do documento da ZapSign no contrato' });

  const resposta = await fetch(`https://api.zapsign.com.br/api/v1/docs/${encodeURIComponent(contrato.zapsignToken)}/`, {
    headers: { Authorization: `Bearer ${process.env.ZAPSIGN_API_TOKEN}` },
  });
  if (!resposta.ok) return res.status(502).json({ erro: `a ZapSign respondeu ${resposta.status}` });
  const documento = await resposta.json();
  const resultado = aplicarEventoZapSign(db, { event_type: 'doc_refreshed', document: documento });
  await save(db);
  res.json({ sincronizado: resultado.aplicado, status: contrato.zapsignStatus || null });
});

app.get('/api/whatsapp/status', async (req, res) => {
  const db = await load();
  const ultimaEntrada = (db.leads || [])
    .map((lead) => lead.ultimaInteracaoEm)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
  const configurado = !!(process.env.WHATSAPP_VERIFY_TOKEN && process.env.WHATSAPP_APP_SECRET);
  const envioConfigurado = configuracaoEnvioValida({
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
  });
  const ultimoWebhookEm = db.integracoes && db.integracoes.whatsapp
    ? db.integracoes.whatsapp.ultimoWebhookEm || null
    : null;
  res.json({
    receptorPronto: true,
    configurado,
    conectado: !!(configurado && ultimoWebhookEm),
    envioConfigurado,
    ultimoWebhookEm,
    ultimaEntrada,
    webhook: `${req.protocol}://${req.get('host')}/webhooks/whatsapp`,
  });
});

app.post('/api/leads/:id/whatsapp/mensagens', async (req, res) => {
  const leadId = Number(req.params.id);
  const texto = String(req.body.texto || '').trim();
  const dbAntesDoEnvio = await load();
  const leadAntesDoEnvio = (dbAntesDoEnvio.leads || []).find((item) => item.id === leadId);
  if (!leadAntesDoEnvio) return res.status(404).json({ erro: 'lead não encontrado' });

  try {
    const resultado = await enviarMensagemTexto({
      telefone: leadAntesDoEnvio.whatsappWaId || leadAntesDoEnvio.telefone,
      texto,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      apiVersion: process.env.WHATSAPP_GRAPH_API_VERSION || 'v26.0',
    });

    // Recarrega depois da chamada externa para preservar mensagens que possam ter
    // chegado pelo webhook enquanto a Meta processava o envio.
    const db = await load();
    const lead = (db.leads || []).find((item) => item.id === leadId);
    if (!lead) return res.status(409).json({ erro: 'a mensagem foi enviada, mas o lead não existe mais para registrar o histórico' });
    const interacao = registrarMensagemSaida(lead, {
      idMensagem: resultado.idMensagem,
      texto,
    });
    auditar(req, db, 'enviou mensagem', 'leads', lead, 'Resposta enviada pela API oficial do WhatsApp');
    await save(db);
    return res.status(201).json(interacao);
  } catch (erro) {
    console.error('Erro ao enviar mensagem pelo WhatsApp:', erro.message, erro.metaCode || '');
    return res.status(erro.statusCode || 500).json({ erro: erro.message || 'não foi possível enviar a mensagem' });
  }
});

app.post('/api/leads/:id/marcar-lidas', async (req, res) => {
  const db = await load();
  const lead = (db.leads || []).find((item) => item.id === Number(req.params.id));
  if (!lead) return res.status(404).json({ erro: 'lead não encontrado' });
  lead.naoLidas = 0;
  auditar(req, db, 'marcou como lidas', 'leads', lead, lead.nome || '');
  await save(db);
  res.json({ ok: true });
});

app.get('/api/me', async (req, res) => {
  const db = await load();
  const user = (db.usuarios || []).find((u) => u.id === req.session.userId);
  if (!user) return res.status(401).json({ erro: 'sessão inválida' });
  res.json({ id: user.id, nome: user.nome, email: user.email, role: user.role, precisaTrocarSenha: !!user.precisaTrocarSenha });
});

app.post('/api/trocar-senha', async (req, res) => {
  const db = await load();
  const user = (db.usuarios || []).find((u) => u.id === req.session.userId);
  const { senhaAtual, novaSenha } = req.body;
  if (!user || !bcrypt.compareSync(String(senhaAtual || ''), user.senhaHash)) {
    return res.status(400).json({ erro: 'senha atual incorreta' });
  }
  if (!novaSenha || novaSenha.length < 8) {
    return res.status(400).json({ erro: 'a nova senha precisa ter pelo menos 8 caracteres' });
  }
  user.senhaHash = bcrypt.hashSync(novaSenha, 10);
  user.precisaTrocarSenha = false;
  await save(db);
  res.json({ ok: true });
});

app.get('/api/usuarios', requireAdmin, async (req, res) => {
  const db = await load();
  res.json((db.usuarios || []).map((u) => ({ id: u.id, nome: u.nome, email: u.email, role: u.role, precisaTrocarSenha: !!u.precisaTrocarSenha })));
});

app.post('/api/usuarios', requireAdmin, async (req, res) => {
  const db = await load();
  if (!db.usuarios) db.usuarios = [];
  const { nome, email, senha, role } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'nome, e-mail e senha são obrigatórios' });
  if (db.usuarios.find((u) => u.email.toLowerCase() === String(email).toLowerCase())) {
    return res.status(400).json({ erro: 'já existe um usuário com esse e-mail' });
  }
  const novo = {
    id: nextId(db.usuarios),
    nome,
    email,
    role: role === 'admin' ? 'admin' : 'membro',
    senhaHash: bcrypt.hashSync(senha, 10),
    precisaTrocarSenha: true,
    criadoEm: new Date().toISOString(),
  };
  db.usuarios.push(novo);
  await save(db);
  res.status(201).json({ id: novo.id });
});

app.delete('/api/usuarios/:id', requireAdmin, async (req, res) => {
  const db = await load();
  if ((db.usuarios || []).length <= 1) return res.status(400).json({ erro: 'não é possível remover o único usuário do sistema' });
  if (Number(req.params.id) === req.session.userId) return res.status(400).json({ erro: 'você não pode remover seu próprio usuário' });
  db.usuarios = db.usuarios.filter((u) => u.id !== Number(req.params.id));
  await save(db);
  res.json({ removido: true });
});

function crud(resource) {
  const base = `/api/${resource}`;

  app.get(base, async (req, res) => {
    const db = await load();
    res.json(db[resource]);
  });

  app.get(`${base}/:id`, async (req, res) => {
    const db = await load();
    const item = db[resource].find((i) => i.id === Number(req.params.id));
    if (!item) return res.status(404).json({ erro: 'não encontrado' });
    res.json(item);
  });

  app.post(base, async (req, res) => {
    const db = await load();
    let item = { id: nextId(db[resource]), criadoEm: new Date().toISOString(), ...req.body };
    if (resource === 'clientes' && !String(item.nome || '').trim()) return res.status(400).json({ erro: 'nome do cliente é obrigatório' });
    if (resource === 'clientes') {
      const documentoNormalizado = String(item.documento || '').replace(/\D/g, '');
      const nomeNormalizado = String(item.nome || '').trim().toLocaleLowerCase('pt-BR');
      const emailNormalizado = String(item.email || '').trim().toLocaleLowerCase('pt-BR');
      const telefoneNormalizado = String(item.telefone || '').replace(/\D/g, '');
      const duplicado = db.clientes.find((cliente) => {
        const mesmoDocumento = documentoNormalizado && String(cliente.documento || '').replace(/\D/g, '') === documentoNormalizado;
        const mesmosDados =
          String(cliente.nome || '').trim().toLocaleLowerCase('pt-BR') === nomeNormalizado &&
          String(cliente.email || '').trim().toLocaleLowerCase('pt-BR') === emailNormalizado &&
          String(cliente.telefone || '').replace(/\D/g, '') === telefoneNormalizado;
        return mesmoDocumento || mesmosDados;
      });
      if (duplicado) return res.status(409).json({ erro: 'já existe uma cliente com estes dados', clienteId: duplicado.id });
    }
    if (resource === 'processos' && !String(item.nome || '').trim()) return res.status(400).json({ erro: 'nome ou número do processo é obrigatório' });
    if (resource === 'eventos' && (!String(item.titulo || '').trim() || !item.data)) return res.status(400).json({ erro: 'título e data do evento são obrigatórios' });
    if (resource === 'leads' && !String(item.nome || '').trim()) return res.status(400).json({ erro: 'nome do lead é obrigatório' });
    if (resource === 'tarefas' && !String(item.titulo || '').trim()) return res.status(400).json({ erro: 'título da tarefa é obrigatório' });
    if (resource === 'contratos' && (!item.clienteId || !String(item.descricao || '').trim() || Number(item.valorTotal) <= 0)) return res.status(400).json({ erro: 'cliente, descrição e valor do contrato são obrigatórios' });
    if (resource === 'pagamentos' && (!item.data || Number(item.valor) <= 0)) return res.status(400).json({ erro: 'data e valor do pagamento são obrigatórios' });
    if (resource === 'processos') item.numeroNormalizado = String(item.numeroProcesso || item.nome || '').replace(/\D/g, '');
    if (resource === 'contratos') item = normalizarContrato(item);
    db[resource].push(item);
    auditar(req, db, 'criou', resource, item, item.nome || item.titulo || item.descricao || '');
    await save(db);
    if (resource === 'clientes') {
      await garantirPastaDriveCliente(item);
      await save(db);
    }
    res.status(201).json(item);
  });

  app.put(`${base}/:id`, async (req, res) => {
    const db = await load();
    const idx = db[resource].findIndex((i) => i.id === Number(req.params.id));
    if (idx === -1) return res.status(404).json({ erro: 'não encontrado' });
    db[resource][idx] = { ...db[resource][idx], ...req.body, id: Number(req.params.id) };
    if (resource === 'processos') db[resource][idx].numeroNormalizado = String(db[resource][idx].numeroProcesso || db[resource][idx].nome || '').replace(/\D/g, '');
    if (resource === 'tarefas' && db[resource][idx].status === 'Concluída' && !String(db[resource][idx].evidencia || '').trim()) return res.status(400).json({ erro: 'registre a evidência antes de concluir a tarefa' });
    if (resource === 'contratos') db[resource][idx] = normalizarContrato(db[resource][idx]);
    auditar(req, db, 'atualizou', resource, db[resource][idx], db[resource][idx].nome || db[resource][idx].titulo || db[resource][idx].descricao || '');
    await save(db);
    res.json(db[resource][idx]);
  });

  app.delete(`${base}/:id`, async (req, res) => {
    const db = await load();
    const before = db[resource].length;
    const item = db[resource].find((i) => i.id === Number(req.params.id));
    db[resource] = db[resource].filter((i) => i.id !== Number(req.params.id));
    if (item) auditar(req, db, 'removeu', resource, item, item.nome || item.titulo || item.descricao || '');
    await save(db);
    res.json({ removido: before !== db[resource].length });
  });
}

['clientes', 'processos', 'eventos', 'leads', 'tarefas', 'contratos', 'pagamentos'].forEach(crud);

app.post('/api/tarefas/:id/concluir', async (req, res) => {
  const db = await load();
  const tarefa = (db.tarefas || []).find((t) => t.id === Number(req.params.id));
  if (!tarefa) return res.status(404).json({ erro: 'tarefa não encontrada' });
  const evidencia = String(req.body.evidencia || '').trim();
  if (!evidencia) return res.status(400).json({ erro: 'registre a evidência antes de concluir a tarefa' });
  tarefa.status = req.body.enviarParaRevisao ? 'Aguardando revisão' : 'Concluída';
  tarefa.evidencia = evidencia;
  tarefa.concluidaEm = new Date().toISOString();
  tarefa.concluidaPorId = req.session.userId;
  auditar(req, db, 'concluiu', 'tarefa', tarefa, `Evidência registrada: ${evidencia.slice(0, 120)}`);
  await save(db);
  res.json(tarefa);
});

app.post('/api/tarefas/:id/revisar', async (req, res) => {
  const db = await load();
  const tarefa = (db.tarefas || []).find((t) => t.id === Number(req.params.id));
  if (!tarefa) return res.status(404).json({ erro: 'tarefa não encontrada' });
  if (!String(tarefa.evidencia || '').trim()) return res.status(400).json({ erro: 'não é possível revisar sem evidência' });
  tarefa.status = 'Concluída';
  tarefa.revisadoEm = new Date().toISOString();
  tarefa.revisadoPorId = req.session.userId;
  tarefa.observacaoRevisao = String(req.body.observacao || '').trim();
  auditar(req, db, 'revisou', 'tarefa', tarefa, tarefa.observacaoRevisao || 'Revisão aprovada');
  await save(db);
  res.json(tarefa);
});

function dataHoje() {
  return new Date().toISOString().slice(0, 10);
}

function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function calcularControladoria(db) {
  const hoje = dataHoje();
  const itens = [];
  const adicionar = (tipo, risco, titulo, acao, referencia, fonte, evidencia, confianca = 'Alta') => {
    itens.push({ id: `${tipo}-${referencia || itens.length + 1}`, tipo, risco, titulo, acao, referencia: referencia || null, fonte, evidencia, confianca });
  };

  (db.tarefas || []).forEach((t) => {
    if (t.status !== 'Concluída' && t.prazo && t.prazo < hoje) adicionar('Prazo', 'Crítico', `Tarefa vencida: ${t.titulo}`, 'Revisar o prazo, executar e registrar evidência.', t.id, 'Tarefas', `Prazo cadastrado: ${t.prazo}`);
    if (t.status === 'Concluída' && !String(t.evidencia || '').trim()) adicionar('Evidência', 'Alto', `Conclusão sem evidência: ${t.titulo}`, 'Anexar ou descrever a evidência da conclusão.', t.id, 'Tarefas', 'Status concluído sem comprovação');
  });

  (db.publicacoes || []).forEach((p) => {
    if (!p.processoId) adicionar('Conciliação', 'Crítico', 'Publicação sem processo conciliado', 'Localizar o processo pelo número CNJ e vincular antes de tratar.', p.id, p.tribunal || 'Publicações', p.numeroProcesso || p.descricao, 'Média');
    if (p.status === 'Nova') adicionar('Publicação', p.prazoFatal ? 'Crítico' : 'Alto', `Publicação não tratada: ${p.descricao}`, 'Conferir a fonte oficial e criar tarefa com responsável.', p.id, p.tribunal || 'Publicações', `Publicada em ${p.dataPublicacao}${p.prazoFatal ? `; prazo ${p.prazoFatal}` : ''}`);
  });

  (db.processos || []).forEach((p) => {
    const faltantes = [];
    if (!p.clienteId) faltantes.push('cliente');
    if (!p.area) faltantes.push('área');
    if (!p.status) faltantes.push('status');
    if (!String(p.numeroProcesso || p.nome || '').match(/\d/)) faltantes.push('número CNJ');
    if (faltantes.length) adicionar('Cadastro', 'Médio', `Processo com cadastro incompleto: ${p.nome || `#${p.id}`}`, `Preencher ${faltantes.join(', ')}.`, p.id, 'Processos', `Campos ausentes: ${faltantes.join(', ')}`);
  });

  (db.clientes || []).forEach((cliente) => {
    const pendentes = checklistCompleto(db, cliente).filter((item) => item.solicitado && !item.enviado);
    if (pendentes.length) adicionar('Documentos', 'Alto', `Documentação pendente: ${cliente.nome}`, `Acompanhar os ${pendentes.length} item(ns) solicitados no link do cliente.`, cliente.id, 'Rotina Documental', pendentes.slice(0, 3).map((p) => p.rotulo).join('; ') + (pendentes.length > 3 ? '…' : ''), 'Alta');
  });

  (db.contratos || []).forEach((c) => {
    if (c.status !== 'Cancelado' && !(db.pagamentos || []).some((p) => p.contratoId === c.id)) adicionar('Financeiro', 'Médio', `Contrato sem recebimento: ${c.descricao || `#${c.id}`}`, 'Conferir vencimento e iniciar acompanhamento de cobrança.', c.id, 'Contratos x pagamentos', `Valor contratado: ${numero(c.valorTotal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
  });
  (db.pagamentos || []).forEach((p) => {
    if (!p.contratoId) adicionar('Financeiro', 'Alto', `Pagamento sem contrato: ${p.descricao || `#${p.id}`}`, 'Identificar o contrato e conciliar o recebimento.', p.id, 'Pagamentos', `Valor: ${numero(p.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
  });

  const ordem = { 'Crítico': 0, Alto: 1, 'Médio': 2, Baixo: 3 };
  return itens.sort((a, b) => ordem[a.risco] - ordem[b.risco]);
}

app.get('/api/controladoria', async (req, res) => {
  const itens = calcularControladoria(await load());
  res.json({ resumo: { total: itens.length, criticos: itens.filter((i) => i.risco === 'Crítico').length, altos: itens.filter((i) => i.risco === 'Alto').length, medios: itens.filter((i) => i.risco === 'Médio').length }, itens });
});

app.get('/api/financeiro', async (req, res) => res.json(calcularFinanceiro(await load())));

app.get('/api/publicacoes', async (req, res) => {
  const db = await load();
  res.json([...(db.publicacoes || [])].sort((a, b) => new Date(b.dataPublicacao) - new Date(a.dataPublicacao)));
});

app.post('/api/publicacoes', async (req, res) => {
  const db = await load();
  let { processoId, numeroProcesso, descricao, dataPublicacao, prazoFatal, tribunal, origem } = req.body;
  if (!descricao || !dataPublicacao) return res.status(400).json({ erro: 'descrição e data da publicação são obrigatórias' });
  if (!processoId && numeroProcesso) {
    const normalizado = String(numeroProcesso).replace(/\D/g, '');
    const encontrado = normalizado ? (db.processos || []).find((p) => String(p.numeroNormalizado || p.numeroProcesso || p.nome || '').replace(/\D/g, '') === normalizado) : null;
    if (encontrado) processoId = encontrado.id;
  }
  const item = {
    id: nextId(db.publicacoes), processoId: processoId ? Number(processoId) : null,
    numeroProcesso: String(numeroProcesso || '').trim() || null,
    numeroNormalizado: String(numeroProcesso || '').replace(/\D/g, '') || null,
    descricao, dataPublicacao, prazoFatal: prazoFatal || null,
    tribunal: tribunal || 'TJMG', origem: origem || 'Registro manual', status: 'Nova', criadoEm: new Date().toISOString(),
  };
  db.publicacoes.push(item);
  auditar(req, db, 'registrou', 'publicação', item, descricao);
  await save(db);
  res.status(201).json(item);
});

app.post('/api/publicacoes/:id/criar-tarefa', async (req, res) => {
  const db = await load();
  const publicacao = (db.publicacoes || []).find((p) => p.id === Number(req.params.id));
  if (!publicacao) return res.status(404).json({ erro: 'publicação não encontrada' });
  if (!publicacao.processoId) return res.status(400).json({ erro: 'vincule a publicação a um processo antes de criar a tarefa' });
  const processo = (db.processos || []).find((p) => p.id === publicacao.processoId);
  const tarefa = {
    id: nextId(db.tarefas), titulo: `Providenciar: ${publicacao.descricao}`, processoId: publicacao.processoId,
    responsavelId: req.body.responsavelId ? Number(req.body.responsavelId) : req.session.userId,
    prazo: publicacao.prazoFatal, tipoPrazo: publicacao.prazoFatal ? 'Fatal' : 'Interno',
    prioridade: publicacao.prazoFatal ? 'Alta' : 'Média', status: 'A fazer',
    observacoes: `Publicação ${publicacao.tribunal || 'TJMG'} em ${publicacao.dataPublicacao}. Processo: ${processo ? processo.nome : ''}`,
    criadoEm: new Date().toISOString(),
  };
  db.tarefas.push(tarefa);
  publicacao.status = 'Tratada';
  publicacao.tarefaId = tarefa.id;
  auditar(req, db, 'criou', 'tarefa', tarefa, tarefa.titulo);
  await save(db);
  res.status(201).json(tarefa);
});

app.get('/api/auditoria', requireAdmin, async (req, res) => {
  const db = await load();
  res.json([...(db.auditoria || [])].sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm)).slice(0, 100));
});

// Equipe: gera (ou reaproveita) o link de envio de documentos para um cliente
// (por cliente, não por processo — o processo só é criado depois que a documentação chega)
app.post('/api/clientes/:id/link-envio', async (req, res) => {
  const db = await load();
  const cliente = db.clientes.find((c) => c.id === Number(req.params.id));
  if (!cliente) return res.status(404).json({ erro: 'não encontrado' });
  if (!cliente.uploadToken) {
    cliente.uploadToken = crypto.randomBytes(16).toString('hex');
    await save(db);
  }
  res.json({ token: cliente.uploadToken, caminho: '/enviar-documentos/' + cliente.uploadToken });
});

// Equipe: lista os modelos de checklist disponíveis (Genérico + os 42 tipos de caso do
// manual), agrupados por categoria, para a equipe escolher quais se aplicam a cada cliente.
app.get('/api/checklist-templates', async (req, res) => {
  res.json(
    CHECKLIST_TEMPLATES.map((t) => ({
      id: t.id,
      categoria: t.categoria,
      titulo: t.titulo,
      quantidadeItens: t.itens.length,
      temOrientacao: !!t.orientacaoRelato,
    }))
  );
});

// Equipe: status do checklist de rotina documental de um cliente (mostra os itens dos
// tipos de caso escolhidos para ele, com a marcação de quais foram solicitados e quais
// já chegaram)
app.get('/api/clientes/:id/rotina', async (req, res) => {
  const db = await load();
  const cliente = db.clientes.find((c) => c.id === Number(req.params.id));
  if (!cliente) return res.status(404).json({ erro: 'não encontrado' });
  res.json({
    cliente: {
      id: cliente.id,
      nome: cliente.nome,
      uploadToken: cliente.uploadToken || null,
      tiposCaso: tiposCasoAtivos(cliente),
    },
    checklist: checklistCompleto(db, cliente),
  });
});

// Equipe: define quais tipos de caso se aplicam a este cliente (pode combinar mais de um,
// ex: cirurgia + OPME + reembolso). Ao ativar um tipo de caso novo, todos os itens dele
// entram solicitados por padrão; ao remover um tipo de caso, seus itens somem do checklist.
app.put('/api/clientes/:id/tipos-caso', async (req, res) => {
  const db = await load();
  const cliente = db.clientes.find((c) => c.id === Number(req.params.id));
  if (!cliente) return res.status(404).json({ erro: 'não encontrado' });

  const tiposNovos = Array.isArray(req.body.tipos) ? req.body.tipos.filter((id) => TEMPLATE_POR_ID[id]) : [];
  const tiposAntigos = new Set(tiposCasoAtivos(cliente));
  const setNovos = new Set(tiposNovos.length ? tiposNovos : ['GEN']);

  const antigoSolicitados = new Set(Array.isArray(cliente.documentosSolicitados) ? cliente.documentosSolicitados : []);
  const novoSolicitados = new Set();
  for (const codigo of antigoSolicitados) {
    const item = ITEM_POR_CODIGO[codigo];
    if (item && setNovos.has(item.templateId)) novoSolicitados.add(codigo);
  }
  for (const tipoId of setNovos) {
    if (!tiposAntigos.has(tipoId)) {
      const template = TEMPLATE_POR_ID[tipoId];
      if (template) template.itens.forEach((item) => novoSolicitados.add(item.codigo));
    }
  }

  cliente.tiposCaso = [...setNovos];
  cliente.documentosSolicitados = [...novoSolicitados];
  await save(db);
  res.json({ ok: true, tiposCaso: cliente.tiposCaso });
});

// Equipe: ajuste fino — marca/desmarca itens individuais dentro dos tipos de caso já
// escolhidos para este cliente
app.put('/api/clientes/:id/documentos-solicitados', async (req, res) => {
  const db = await load();
  const cliente = db.clientes.find((c) => c.id === Number(req.params.id));
  if (!cliente) return res.status(404).json({ erro: 'não encontrado' });
  const codigos = Array.isArray(req.body.codigos) ? req.body.codigos.filter((c) => CODIGOS_VALIDOS.has(c)) : [];
  cliente.documentosSolicitados = codigos;
  await save(db);
  res.json({ ok: true, documentosSolicitados: codigos });
});

app.get('/api/documentos', async (req, res) => {
  const db = await load();
  res.json(db.documentos);
});

app.post('/api/documentos', upload.single('arquivo'), async (req, res) => {
  const db = await load();
  let arquivoRef = null;
  let nomeOriginal = null;
  if (req.file) {
    const idArquivo = await salvarArquivo(req.file.buffer, req.file.originalname, req.file.mimetype);
    arquivoRef = '/uploads/' + idArquivo;
    nomeOriginal = req.file.originalname;
  }
  const item = {
    id: nextId(db.documentos),
    nome: req.body.nome || nomeOriginal || 'Documento',
    clienteId: req.body.clienteId ? Number(req.body.clienteId) : null,
    processoId: req.body.processoId ? Number(req.body.processoId) : null,
    tipo: req.body.tipo || 'Outro',
    arquivo: arquivoRef,
    nomeOriginal,
    criadoEm: new Date().toISOString(),
  };
  db.documentos.push(item);
  await save(db);
  if (req.file && item.clienteId) {
    const cliente = db.clientes.find((c) => c.id === item.clienteId);
    if (cliente) {
      await sincronizarDocumentoDrive(cliente, item, req.file.buffer, req.file.mimetype);
      await save(db);
    }
  }
  res.status(201).json(item);
});

app.get('/api/drive/status', async (req, res) => {
  res.json({
    configurado: configuracaoDriveValida(),
    automacaoConfigurada: !!String(process.env.GOOGLE_DRIVE_WEBHOOK_URL || '').trim(),
  });
});

app.post('/api/clientes/:id/drive/sincronizar', async (req, res) => {
  const db = await load();
  const cliente = db.clientes.find((c) => c.id === Number(req.params.id));
  if (!cliente) return res.status(404).json({ erro: 'cliente não encontrado' });
  if (!configuracaoDriveValida()) return res.status(503).json({ erro: 'a integração com o Google Drive ainda não foi configurada na Render' });

  const pasta = await garantirPastaDriveCliente(cliente);
  if (!pasta) {
    await save(db);
    return res.status(502).json({ erro: cliente.driveSyncErro || 'não foi possível criar a pasta da cliente no Drive' });
  }

  let documentosSincronizados = 0;
  for (const documento of db.documentos.filter((d) => d.clienteId === cliente.id && d.arquivo && !d.driveFileId)) {
    const idArquivo = Number(String(documento.arquivo).split('/').pop());
    if (Number.isNaN(idArquivo)) continue;
    const arquivo = await buscarArquivo(idArquivo);
    if (!arquivo) continue;
    const resultado = await sincronizarDocumentoDrive(cliente, documento, arquivo.dados, arquivo.mimetype);
    if (resultado) documentosSincronizados++;
  }
  auditar(req, db, 'sincronizou', 'clientes', cliente, `Pasta do Drive e ${documentosSincronizados} documento(s)`);
  await save(db);
  res.json({ ok: true, pastaUrl: cliente.driveFolderUrl, documentosSincronizados });
});

app.delete('/api/documentos/:id', async (req, res) => {
  const db = await load();
  const doc = db.documentos.find((d) => d.id === Number(req.params.id));
  if (doc && doc.arquivo) {
    const idArquivo = Number(String(doc.arquivo).split('/').pop());
    if (!Number.isNaN(idArquivo)) await removerArquivo(idArquivo);
  }
  db.documentos = db.documentos.filter((d) => d.id !== Number(req.params.id));
  await save(db);
  res.json({ removido: true });
});

app.get('/api/dashboard', async (req, res) => {
  const db = await load();
  const totalProcessos = db.processos.length;
  const liminaresDeferidas = db.processos.filter((p) => p.liminarDeferida).length;
  const hoje = new Date();
  const daqui7dias = new Date();
  daqui7dias.setDate(hoje.getDate() + 7);
  const prazosSemana = db.eventos.filter((e) => {
    if (!e.data) return false;
    const dataEvento = new Date(e.data + 'T00:00:00');
    return dataEvento >= new Date(hoje.toDateString()) && dataEvento <= daqui7dias;
  }).length;
  const acoesPendentes = db.processos.filter((p) => p.status === 'Aguardando').length;

  const recentes = [...db.processos]
    .sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm))
    .slice(0, 5)
    .map((p) => {
      const cliente = db.clientes.find((c) => c.id === p.clienteId);
      return { ...p, clienteNome: cliente ? cliente.nome : '—' };
    });

  const documentosNovos = db.documentos
    .filter((d) => d.origem === 'cliente-rotina' && !d.visto)
    .sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm))
    .map((d) => {
      const cliente = db.clientes.find((c) => c.id === d.clienteId);
      return {
        id: d.id,
        nome: d.nome,
        clienteId: d.clienteId,
        clienteNome: cliente ? cliente.nome : '—',
        arquivo: d.arquivo,
        nomeOriginal: d.nomeOriginal,
        criadoEm: d.criadoEm,
      };
    });

  const hojeStr = new Date().toISOString().slice(0, 10);
  const tarefasAbertas = (db.tarefas || []).filter((t) => t.status !== 'Concluída');
  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  const amanhaStr = amanha.toISOString().slice(0, 10);
  const controladoria = calcularControladoria(db);
  const financeiro = calcularFinanceiro(db);

  res.json({
    totalProcessos,
    liminaresDeferidas,
    prazosSemana,
    acoesPendentes,
    totalClientes: db.clientes.length,
    processosRecentes: recentes,
    documentosNovos,
    tarefasHoje: tarefasAbertas.filter((t) => t.prazo === hojeStr),
    tarefasAmanha: tarefasAbertas.filter((t) => t.prazo === amanhaStr),
    tarefasVencidas: tarefasAbertas.filter((t) => t.prazo && t.prazo < hojeStr),
    publicacoesNovas: (db.publicacoes || []).filter((p) => p.status === 'Nova'),
    excecoesCriticas: controladoria.filter((i) => i.risco === 'Crítico').length,
    excecoesTotal: controladoria.length,
    financeiroVencido: financeiro.vencido,
  });
});

app.post('/api/documentos/:id/marcar-visto', async (req, res) => {
  const db = await load();
  const doc = db.documentos.find((d) => d.id === Number(req.params.id));
  if (!doc) return res.status(404).json({ erro: 'não encontrado' });
  doc.visto = true;
  await save(db);
  res.json({ ok: true });
});

app.post('/api/documentos/marcar-todos-vistos', async (req, res) => {
  const db = await load();
  db.documentos.forEach((d) => {
    if (d.origem === 'cliente-rotina') d.visto = true;
  });
  await save(db);
  res.json({ ok: true });
});

app.get('/uploads/:id', requireAuth, async (req, res) => {
  const idArquivo = Number(req.params.id);
  if (Number.isNaN(idArquivo)) return res.status(404).send('Arquivo não encontrado.');
  const arquivo = await buscarArquivo(idArquivo);
  if (!arquivo) return res.status(404).send('Arquivo não encontrado.');
  res.setHeader('Content-Type', arquivo.mimetype || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(arquivo.nome_original || 'arquivo')}"`);
  res.send(arquivo.dados);
});

app.get('/enviar-documentos/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'enviar-documentos.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

async function iniciarServidor() {
  await ensureAdminSeed();
  app.listen(PORT, () => {
    console.log(`CRM rodando em http://localhost:${PORT}`);
  });
}

iniciarServidor().catch((err) => {
  console.error('Erro ao iniciar o servidor:', err);
  process.exit(1);
});
