const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const cookieSession = require('cookie-session');
const { load, save, nextId, salvarArquivo, buscarArquivo, removerArquivo } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '15mb' }));

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

// ---------- Rotina Documental (checklist POP + envio pelo cliente) ----------
const POP_CHECKLIST = [
  { codigo: '01', rotulo: 'Procuração' },
  { codigo: '02', rotulo: 'RG ou CNH' },
  { codigo: '03', rotulo: 'CPF' },
  { codigo: '04', rotulo: 'Certidão de Nascimento' },
  { codigo: '05', rotulo: 'Certidão de Casamento' },
  { codigo: '06', rotulo: 'Comprovante de Residência' },
  { codigo: '07', rotulo: 'Comprovante de Rendimentos' },
  { codigo: '08', rotulo: 'Declaração de Hipossuficiência' },
  { codigo: '09', rotulo: 'Laudo Médico' },
  { codigo: '10', rotulo: 'Relatório Médico' },
  { codigo: '11', rotulo: 'Negativa Administrativa' },
  { codigo: '12', rotulo: 'Exames' },
  { codigo: '13', rotulo: 'Receitas Médicas' },
  { codigo: '14', rotulo: 'Extratos de Pagamento do Plano' },
  { codigo: '15', rotulo: 'Extratos de Coparticipação' },
  { codigo: '16', rotulo: 'Carteirinha do Plano' },
  { codigo: '17', rotulo: 'Cartão SUS' },
  { codigo: '18', rotulo: 'Extrato de Plataforma' },
  { codigo: '19', rotulo: 'Saldo de Plataforma' },
  { codigo: '20', rotulo: 'Extratos Bancários' },
  { codigo: '21', rotulo: 'Artigos Científicos' },
  { codigo: '22', rotulo: 'Legislações' },
  { codigo: '23', rotulo: 'Resoluções' },
  { codigo: '24', rotulo: 'Outros Documentos' },
];
const CODIGOS_POP_VALIDOS = new Set(POP_CHECKLIST.map((i) => i.codigo));
const uploadRotina = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function montarChecklist(db, processoId) {
  const enviados = db.documentos.filter((d) => d.processoId === processoId && d.categoriaPOP);
  return POP_CHECKLIST.map((item) => {
    const doc = enviados.find((d) => d.categoriaPOP === item.codigo);
    return {
      ...item,
      enviado: !!doc,
      documentoId: doc ? doc.id : null,
      arquivo: doc ? doc.arquivo : null,
      nomeOriginal: doc ? doc.nomeOriginal : null,
      enviadoEm: doc ? doc.criadoEm : null,
    };
  });
}

// Público: dados do processo + checklist, a partir do link enviado ao cliente (sem login)
app.get('/api/publico/rotina/:token', async (req, res) => {
  const db = await load();
  const processo = db.processos.find((p) => p.uploadToken === req.params.token);
  if (!processo) return res.status(404).json({ erro: 'link inválido ou expirado' });
  const cliente = db.clientes.find((c) => c.id === processo.clienteId);
  res.json({
    clienteNome: cliente ? cliente.nome : '',
    processoNome: processo.nome || '',
    checklist: montarChecklist(db, processo.id),
  });
});

// Público: recebe os arquivos enviados pelo cliente pelo link
app.post('/api/publico/rotina/:token/upload', uploadRotina.any(), async (req, res) => {
  const db = await load();
  const processo = db.processos.find((p) => p.uploadToken === req.params.token);
  if (!processo) return res.status(404).json({ erro: 'link inválido ou expirado' });

  let salvos = 0;
  for (const file of req.files || []) {
    const codigo = file.fieldname;
    if (!CODIGOS_POP_VALIDOS.has(codigo)) continue;
    const item = POP_CHECKLIST.find((i) => i.codigo === codigo);
    const idArquivo = await salvarArquivo(file.buffer, file.originalname, file.mimetype);
    const doc = {
      id: nextId(db.documentos),
      nome: item.rotulo,
      clienteId: processo.clienteId,
      processoId: processo.id,
      tipo: item.rotulo,
      categoriaPOP: codigo,
      arquivo: '/uploads/' + idArquivo,
      nomeOriginal: file.originalname,
      criadoEm: new Date().toISOString(),
      origem: 'cliente-rotina',
    };
    db.documentos.push(doc);
    salvos++;
  }
  await save(db);
  res.json({ ok: true, salvos });
});

app.use('/api', requireAuth);

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
    const item = { id: nextId(db[resource]), criadoEm: new Date().toISOString(), ...req.body };
    db[resource].push(item);
    await save(db);
    res.status(201).json(item);
  });

  app.put(`${base}/:id`, async (req, res) => {
    const db = await load();
    const idx = db[resource].findIndex((i) => i.id === Number(req.params.id));
    if (idx === -1) return res.status(404).json({ erro: 'não encontrado' });
    db[resource][idx] = { ...db[resource][idx], ...req.body, id: Number(req.params.id) };
    await save(db);
    res.json(db[resource][idx]);
  });

  app.delete(`${base}/:id`, async (req, res) => {
    const db = await load();
    const before = db[resource].length;
    db[resource] = db[resource].filter((i) => i.id !== Number(req.params.id));
    await save(db);
    res.json({ removido: before !== db[resource].length });
  });
}

['clientes', 'processos', 'eventos'].forEach(crud);

// Equipe: gera (ou reaproveita) o link de envio de documentos para o cliente de um processo
app.post('/api/processos/:id/link-envio', async (req, res) => {
  const db = await load();
  const processo = db.processos.find((p) => p.id === Number(req.params.id));
  if (!processo) return res.status(404).json({ erro: 'não encontrado' });
  if (!processo.uploadToken) {
    processo.uploadToken = crypto.randomBytes(16).toString('hex');
    await save(db);
  }
  res.json({ token: processo.uploadToken, caminho: '/enviar-documentos/' + processo.uploadToken });
});

// Equipe: status do checklist de rotina documental de um processo
app.get('/api/processos/:id/rotina', async (req, res) => {
  const db = await load();
  const processo = db.processos.find((p) => p.id === Number(req.params.id));
  if (!processo) return res.status(404).json({ erro: 'não encontrado' });
  const cliente = db.clientes.find((c) => c.id === processo.clienteId);
  res.json({
    processo: { id: processo.id, nome: processo.nome, uploadToken: processo.uploadToken || null },
    clienteNome: cliente ? cliente.nome : '—',
    checklist: montarChecklist(db, processo.id),
  });
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
  res.status(201).json(item);
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

  res.json({
    totalProcessos,
    liminaresDeferidas,
    prazosSemana,
    acoesPendentes,
    totalClientes: db.clientes.length,
    processosRecentes: recentes,
  });
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
