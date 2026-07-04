const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const cookieSession = require('cookie-session');
const { load, save, nextId } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use(
  cookieSession({
    name: 'crmSession',
    secret: process.env.SESSION_SECRET || 'troque-este-segredo-em-producao-dev',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
  })
);

const uploadsDir = path.join(__dirname, 'uploads_privados');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

function ensureAdminSeed() {
  const db = load();
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
    save(db);
    console.log('=== Usuário admin inicial criado ===');
    console.log('E-mail:', email);
    if (!process.env.ADMIN_INITIAL_PASSWORD) console.log('Senha temporária:', senhaInicial);
    console.log('=====================================');
  }
}
ensureAdminSeed();

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.status(401).json({ erro: 'não autenticado' });
}
function requireAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') return next();
  res.status(403).json({ erro: 'apenas administradores podem fazer isso' });
}

app.post('/api/login', (req, res) => {
  const db = load();
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

// ---------- sincronização automática (Google Drive) ----------
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

app.post('/api/sync/clientes-processos', requireSyncKey, (req, res) => {
  const db = load();
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

  save(db);
  res.json({ clientesCriados, clientesAtualizados, processosCriados, processosAtualizados });
});

app.post('/api/sync/documento', requireSyncKey, (req, res) => {
  const db = load();
  const { pastaDocumentos, nomeOriginal, tipo, conteudoBase64 } = req.body;
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
  const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
  const ext = path.extname(nomeOriginal);
  const nomeArquivo = unique + ext;
  fs.writeFileSync(path.join(uploadsDir, nomeArquivo), buffer);

  const item = {
    id: nextId(db.documentos),
    nome: nomeOriginal,
    clienteId: processo.clienteId,
    processoId: processo.id,
    tipo: tipo || 'Outro',
    arquivo: '/uploads/' + nomeArquivo,
    nomeOriginal,
    criadoEm: new Date().toISOString(),
    origem: 'sync-drive',
  };
  db.documentos.push(item);
  save(db);
  res.status(201).json({ id: item.id });
});

app.use('/api', requireAuth);

app.get('/api/me', (req, res) => {
  const db = load();
  const user = (db.usuarios || []).find((u) => u.id === req.session.userId);
  if (!user) return res.status(401).json({ erro: 'sessão inválida' });
  res.json({ id: user.id, nome: user.nome, email: user.email, role: user.role, precisaTrocarSenha: !!user.precisaTrocarSenha });
});

app.post('/api/trocar-senha', (req, res) => {
  const db = load();
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
  save(db);
  res.json({ ok: true });
});

app.get('/api/usuarios', requireAdmin, (req, res) => {
  const db = load();
  res.json((db.usuarios || []).map((u) => ({ id: u.id, nome: u.nome, email: u.email, role: u.role, precisaTrocarSenha: !!u.precisaTrocarSenha })));
});

app.post('/api/usuarios', requireAdmin, (req, res) => {
  const db = load();
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
  save(db);
  res.status(201).json({ id: novo.id });
});

app.delete('/api/usuarios/:id', requireAdmin, (req, res) => {
  const db = load();
  if ((db.usuarios || []).length <= 1) return res.status(400).json({ erro: 'não é possível remover o único usuário do sistema' });
  if (Number(req.params.id) === req.session.userId) return res.status(400).json({ erro: 'você não pode remover seu próprio usuário' });
  db.usuarios = db.usuarios.filter((u) => u.id !== Number(req.params.id));
  save(db);
  res.json({ removido: true });
});

function crud(resource) {
  const base = `/api/${resource}`;

  app.get(base, (req, res) => {
    const db = load();
    res.json(db[resource]);
  });

  app.get(`${base}/:id`, (req, res) => {
    const db = load();
    const item = db[resource].find((i) => i.id === Number(req.params.id));
    if (!item) return res.status(404).json({ erro: 'não encontrado' });
    res.json(item);
  });

  app.post(base, (req, res) => {
    const db = load();
    const item = { id: nextId(db[resource]), criadoEm: new Date().toISOString(), ...req.body };
    db[resource].push(item);
    save(db);
    res.status(201).json(item);
  });

  app.put(`${base}/:id`, (req, res) => {
    const db = load();
    const idx = db[resource].findIndex((i) => i.id === Number(req.params.id));
    if (idx === -1) return res.status(404).json({ erro: 'não encontrado' });
    db[resource][idx] = { ...db[resource][idx], ...req.body, id: Number(req.params.id) };
    save(db);
    res.json(db[resource][idx]);
  });

  app.delete(`${base}/:id`, (req, res) => {
    const db = load();
    const before = db[resource].length;
    db[resource] = db[resource].filter((i) => i.id !== Number(req.params.id));
    save(db);
    res.json({ removido: before !== db[resource].length });
  });
}

['clientes', 'processos', 'eventos'].forEach(crud);

app.get('/api/documentos', (req, res) => {
  const db = load();
  res.json(db.documentos);
});

app.post('/api/documentos', upload.single('arquivo'), (req, res) => {
  const db = load();
  const item = {
    id: nextId(db.documentos),
    nome: req.body.nome || (req.file ? req.file.originalname : 'Documento'),
    clienteId: req.body.clienteId ? Number(req.body.clienteId) : null,
    processoId: req.body.processoId ? Number(req.body.processoId) : null,
    tipo: req.body.tipo || 'Outro',
    arquivo: req.file ? '/uploads/' + req.file.filename : null,
    nomeOriginal: req.file ? req.file.originalname : null,
    criadoEm: new Date().toISOString(),
  };
  db.documentos.push(item);
  save(db);
  res.status(201).json(item);
});

app.delete('/api/documentos/:id', (req, res) => {
  const db = load();
  const doc = db.documentos.find((d) => d.id === Number(req.params.id));
  if (doc && doc.arquivo) {
    const filePath = path.join(uploadsDir, path.basename(doc.arquivo));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  db.documentos = db.documentos.filter((d) => d.id !== Number(req.params.id));
  save(db);
  res.json({ removido: true });
});

app.get('/api/dashboard', (req, res) => {
  const db = load();
  const totalProcessos = db.processos.length;
  const liminaresDeferidas = db.processos.filter((p) => p.liminarDeferida).length;
  const cpdsAtivos = db.processos.filter((p) => p.tipo === 'CPD' && p.status !== 'Concluído').length;
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
    cpdsAtivos,
    acoesPendentes,
    totalClientes: db.clientes.length,
    processosRecentes: recentes,
  });
});

app.get('/uploads/:filename', requireAuth, (req, res) => {
  const safe = path.basename(req.params.filename);
  const filePath = path.join(uploadsDir, safe);
  if (!fs.existsSync(filePath)) return res.status(404).send('Arquivo não encontrado.');
  res.sendFile(filePath);
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`CRM rodando em http://localhost:${PORT}`);
});
