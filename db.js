// Camada de dados simples baseada em arquivo JSON.
// Suficiente para uma equipe pequena (2-5 pessoas) usando o CRM ao mesmo tempo
// a partir de um único servidor. Para crescer além disso, migrar para Postgres/MySQL
// (ver README.md, seção "Evoluindo o sistema").

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.json');

const EMPTY_DB = {
  clientes: [],
  processos: [],
  eventos: [],
  documentos: [],
  usuarios: [],
};

function load() {
  if (!fs.existsSync(DB_PATH)) {
    save(EMPTY_DB);
    return structuredClone(EMPTY_DB);
  }
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('data.json corrompido, recriando com base vazia.', e);
    save(EMPTY_DB);
    return structuredClone(EMPTY_DB);
  }
}

function save(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

function nextId(list) {
  return list.length ? Math.max(...list.map((i) => i.id)) + 1 : 1;
}

module.exports = { load, save, nextId, DB_PATH };
