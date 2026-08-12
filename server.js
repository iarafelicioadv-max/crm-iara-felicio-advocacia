const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const cookieSession = require('cookie-session');
const { load, save, nextId, registrarAuditoria } = require('./db');

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
const TIPOS_ARQUIVO_PERMITIDOS = new Set([
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg', 'image/png',
]);
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => TIPOS_ARQUIVO_PERMITIDOS.has(file.mimetype)
    ? cb(null, true) : cb(new Error('Envie apenas PDF, DOC, DOCX, JPG ou PNG.')),
});

function auditar(req, db, acao, recurso, item, detalhes) {
  const usuario = (db.usuarios || []).find((u) => u.id === req.session.userId);
  registrarAuditoria(db, { usuarioId: req.session.userId, usuarioNome: usuario ? usuario.nome : 'Usuário removido', acao, recurso, recursoId: item && item.id, detalhes });
}

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
    if (resource === 'clientes' && !String(item.nome || '').trim()) return res.status(400).json({ erro: 'nome do cliente é obrigatório' });
    if (resource === 'processos' && !String(item.nome || '').trim()) return res.status(400).json({ erro: 'nome ou número do processo é obrigatório' });
    if (resource === 'eventos' && (!String(item.titulo || '').trim() || !item.data)) return res.status(400).json({ erro: 'título e data do evento são obrigatórios' });
    db[resource].push(item);
    auditar(req, db, 'criou', resource, item, item.nome || item.titulo || '');
    save(db);
    res.status(201).json(item);
  });

  app.put(`${base}/:id`, (req, res) => {
    const db = load();
    const idx = db[resource].findIndex((i) => i.id === Number(req.params.id));
    if (idx === -1) return res.status(404).json({ erro: 'não encontrado' });
    db[resource][idx] = { ...db[resource][idx], ...req.body, id: Number(req.params.id) };
    auditar(req, db, 'atualizou', resource, db[resource][idx], db[resource][idx].nome || db[resource][idx].titulo || '');
    save(db);
    res.json(db[resource][idx]);
  });

  app.delete(`${base}/:id`, (req, res) => {
    const db = load();
    const item = db[resource].find((i) => i.id === Number(req.params.id));
    if (!item) return res.status(404).json({ erro: 'não encontrado' });
    if (resource === 'clientes' && (db.processos || []).some((p) => p.clienteId === item.id)) return res.status(400).json({ erro: 'este cliente possui processos vinculados; desvincule-os antes de excluir' });
    if (resource === 'processos' && (db.eventos || []).some((e) => e.processoId === item.id)) return res.status(400).json({ erro: 'este processo possui eventos vinculados; desvincule-os antes de excluir' });
    const before = db[resource].length;
    db[resource] = db[resource].filter((i) => i.id !== Number(req.params.id));
    auditar(req, db, 'removeu', resource, item, item.nome || item.titulo || '');
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
  auditar(req, db, 'incluiu', 'documento', item, item.nome);
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
  auditar(req, db, 'removeu', 'documento', doc, doc ? doc.nome : '');
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

  const hoje = new Date().toISOString().slice(0, 10);
  const limite = new Date();
  limite.setDate(limite.getDate() + 7);
  const proximosPrazos = [...db.eventos, ...db.processos.filter((p) => p.prazo).map((p) => ({
    id: `processo-${p.id}`, data: p.prazo, titulo: `Prazo do processo: ${p.nome}`, tipo: 'Prazo', processoId: p.id,
  }))]
    .filter((e) => e.data && e.data >= hoje && new Date(`${e.data}T00:00:00`) <= limite)
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(0, 8)
    .map((e) => ({ ...e, processoNome: e.processoId ? (db.processos.find((p) => p.id === e.processoId) || {}).nome : null }));

  res.json({
    totalProcessos,
    liminaresDeferidas,
    cpdsAtivos,
    acoesPendentes,
    totalClientes: db.clientes.length,
    processosRecentes: recentes,
    proximosPrazos,
  });
});

app.get('/api/auditoria', requireAdmin, (req, res) => {
  const db = load();
  res.json([...(db.auditoria || [])].sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm)).slice(0, 100));
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ erro: 'o arquivo deve ter no máximo 10 MB' });
  if (err) return res.status(400).json({ erro: err.message || 'erro ao enviar arquivo' });
  next();
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
