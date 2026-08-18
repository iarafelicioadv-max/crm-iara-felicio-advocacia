const assert = require('assert');
const {
  GoogleDriveCRM,
  configuracaoDriveValida,
  nomePastaCliente,
  ordemPreferencialDocumento,
} = require('../google-drive');

assert.equal(nomePastaCliente('  Rafaela / Coutinho  '), 'RAFAELA COUTINHO');
assert.equal(configuracaoDriveValida({ GOOGLE_DRIVE_WEBHOOK_URL: 'https://script.google.com/macros/s/exemplo/exec', GOOGLE_DRIVE_SYNC_SECRET: 'segredo' }), true);
assert.equal(configuracaoDriveValida({}), false);
assert.equal(ordemPreferencialDocumento('01'), 1);
assert.equal(ordemPreferencialDocumento('16'), 16);
assert.equal(ordemPreferencialDocumento('C03-07'), 7);
assert.equal(ordemPreferencialDocumento('Outro'), 999);

(async () => {
  const chamadas = [];
  const respostas = [
    { ok: true, json: async () => ({ ok: true, pastaId: 'pasta-cliente', nome: 'RAFAELA COUTINHO', pastaUrl: 'https://drive.google.com/pasta-cliente', estrutura: { peticaoId: 'pasta-peticao', contratoId: 'pasta-contrato' } }) },
    { ok: true, json: async () => ({ ok: true, arquivoId: 'arquivo-drive', nome: '02 - RG OU CNH - RAFAELA COUTINHO.pdf', arquivoUrl: 'https://drive.google.com/arquivo-drive', originalId: 'arquivo-original', originalUrl: 'https://drive.google.com/arquivo-original', conversaoStatus: 'PDF original' }) },
  ];
  const drive = new GoogleDriveCRM({
    webhookUrl: 'https://script.google.com/macros/s/exemplo/exec',
    syncSecret: 'segredo-teste',
    fetchImpl: async (url, opcoes) => {
      chamadas.push({ url, opcoes, corpo: JSON.parse(opcoes.body) });
      return respostas.shift();
    },
  });
  const pasta = await drive.garantirPastaCliente('Rafaela Coutinho', 9);
  assert.equal(pasta.id, 'pasta-cliente');
  assert.equal(pasta.estrutura.peticaoId, 'pasta-peticao');
  const arquivo = await drive.enviarDocumento({
    pastaId: pasta.id,
    documentoId: 42,
    nome: 'RG ou CNH',
    nomeOriginal: 'RG.pdf',
    nomeCliente: 'Rafaela Coutinho',
    categoriaPOP: '02',
    mimetype: 'application/pdf',
    buffer: Buffer.from('pdf de teste'),
  });
  assert.equal(arquivo.id, 'arquivo-drive');
  assert.equal(arquivo.originalId, 'arquivo-original');
  assert.equal(arquivo.conversaoStatus, 'PDF original');
  assert.equal(chamadas.length, 2);
  assert.equal(chamadas[0].corpo.acao, 'garantirPastaCliente');
  assert.equal(chamadas[0].corpo.nomeCliente, 'RAFAELA COUTINHO');
  assert.equal(chamadas[1].corpo.acao, 'enviarDocumento');
  assert.equal(chamadas[1].corpo.nome, 'RG ou CNH');
  assert.equal(chamadas[1].corpo.nomeOriginal, 'RG.pdf');
  assert.equal(chamadas[1].corpo.nomeCliente, 'RAFAELA COUTINHO');
  assert.equal(chamadas[1].corpo.ordemPreferencial, 2);
  assert.equal(Buffer.from(chamadas[1].corpo.conteudoBase64, 'base64').toString(), 'pdf de teste');
  assert(chamadas.every((c) => c.corpo.segredo === 'segredo-teste'));
  console.log('Testes da integração Google Drive passaram.');
})().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
