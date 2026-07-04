const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { load, save, nextId } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// ---------- helpers ----------
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

// ---------- documentos (com upload de arquivo) ----------
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
    const filePath = path.join(__dirname, 'public', doc.arquivo);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  db.documentos = db.documentos.filter((d) => d.id !== Number(req.params.id));
  save(db);
  res.json({ removido: true });
});

// ---------- dashboard ----------
app.get('/api/dashboard', (req, res) => {
  const db = load();
  const totalProcessos = db.processos.length;
  const liminaresDeferidas = db.processos.filter((p) => p.liminarDeferida).length;
  const cpdsAtivos = db.processos.filter((p) => p.tipo === 'CPD' && p.status !== 'Concluído').length;
  const acoesPendentes = db.processos.filter((p) => p.status === 'Pendente' || p.status === 'Aguardando').length;

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

app.listen(PORT, () => {
  console.log(`CRM rodando em http://localhost:${PORT}`);
});
