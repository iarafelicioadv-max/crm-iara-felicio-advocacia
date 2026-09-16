// Camada de dados baseada em PostgreSQL (Neon).
// Guarda todo o "banco" como um único registro JSONB (simples e suficiente
// para uma equipe pequena), e os arquivos (documentos anexados) em uma
// tabela separada como bytea, para que nada se perca quando o código for
// atualizado e o serviço reiniciado (o disco local do Render NÃO é
// persistente entre deploys — por isso a migração para um banco externo).

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const EMPTY_DB = {
  clientes: [],
  processos: [],
  eventos: [],
  documentos: [],
  usuarios: [],
  auditoria: [],
  leads: [],
  tarefas: [],
  publicacoes: [],
  contratos: [],
  pagamentos: [],
  despesas: [],
  integracoes: {},
  contadores: {},
};

let tabelasProntas = null;
function ensureTabelas() {
  if (!tabelasProntas) {
    tabelasProntas = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_data (
          id INT PRIMARY KEY,
          data JSONB NOT NULL
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS arquivos (
          id SERIAL PRIMARY KEY,
          nome_original TEXT,
          mimetype TEXT,
          dados BYTEA NOT NULL,
          criado_em TIMESTAMPTZ DEFAULT NOW()
        )
      `);
    })();
  }
  return tabelasProntas;
}

async function load() {
  await ensureTabelas();
  const res = await pool.query('SELECT data FROM app_data WHERE id = 1');
  if (res.rows.length === 0) {
    await pool.query('INSERT INTO app_data (id, data) VALUES (1, $1)', [JSON.stringify(EMPTY_DB)]);
    return structuredClone(EMPTY_DB);
  }
  const data = res.rows[0].data || {};
  // garante que coleções novas existam mesmo se o banco já for antigo
  return { ...structuredClone(EMPTY_DB), ...data };
}

async function save(db) {
  await ensureTabelas();
  await pool.query(
    'INSERT INTO app_data (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data = $1',
    [JSON.stringify(db)]
  );
}

// Gera o próximo id de uma coleção sem nunca reaproveitar um id antigo —
// mesmo que o item de maior id tenha sido excluído nesse meio-tempo, o que
// antes podia fazer um cadastro novo "herdar" registros órfãos e órfãs
// (pagamentos, documentos, etc.) que ainda apontavam para aquele número.
function nextId(db, resource) {
  db.contadores = db.contadores || {};
  const lista = db[resource] || [];
  const maiorNaLista = lista.reduce((m, i) => Math.max(m, Number(i.id) || 0), 0);
  const proximo = Math.max(maiorNaLista, db.contadores[resource] || 0) + 1;
  db.contadores[resource] = proximo;
  return proximo;
}

async function salvarArquivo(buffer, nomeOriginal, mimetype) {
  await ensureTabelas();
  const res = await pool.query(
    'INSERT INTO arquivos (nome_original, mimetype, dados) VALUES ($1, $2, $3) RETURNING id',
    [nomeOriginal || null, mimetype || 'application/octet-stream', buffer]
  );
  return res.rows[0].id;
}

async function buscarArquivo(id) {
  await ensureTabelas();
  const res = await pool.query('SELECT nome_original, mimetype, dados FROM arquivos WHERE id = $1', [id]);
  if (res.rows.length === 0) return null;
  return res.rows[0];
}

async function removerArquivo(id) {
  await ensureTabelas();
  await pool.query('DELETE FROM arquivos WHERE id = $1', [id]);
}

module.exports = { load, save, nextId, salvarArquivo, buscarArquivo, removerArquivo };
