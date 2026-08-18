const assert = require('assert');
const crypto = require('crypto');
const {
  aplicarWebhookWhatsApp,
  assinaturaValida,
  telefonesIguais,
  textoMensagem,
  telefoneDestino,
  payloadMensagemTexto,
  enviarMensagemTexto,
  registrarMensagemSaida,
} = require('../whatsapp');

assert.equal(telefonesIguais('(31) 99999-1234', '5531999991234'), true);
assert.equal(textoMensagem({ type: 'image', image: { caption: 'Comprovante' } }), 'Comprovante');

const db = { leads: [], auditoria: [] };
const payload = {
  entry: [{ changes: [{ value: {
    contacts: [{ wa_id: '5531999991234', profile: { name: 'Maria Teste' } }],
    messages: [{ id: 'wamid.abc', from: '5531999991234', timestamp: '1700000000', type: 'text', text: { body: 'Preciso de orientação' } }],
  } }] }],
};

let resultado = aplicarWebhookWhatsApp(db, payload, '2026-08-15T12:00:00.000Z');
assert.deepEqual(resultado, { mensagensNovas: 1, leadsCriados: 1, statusAtualizados: 0 });
assert.equal(db.leads.length, 1);
assert.equal(db.leads[0].nome, 'Maria Teste');
assert.equal(db.leads[0].etapa, 'Novo lead');
assert.equal(db.leads[0].naoLidas, 1);
assert.equal(db.leads[0].ultimaMensagem, 'Preciso de orientação');

const payloadMalicioso = structuredClone(payload);
payloadMalicioso.entry[0].changes[0].value.messages[0] = { id: 'wamid.html', from: '5531999991234', type: 'text', text: { body: '<img src=x onerror=alert(1)>' } };
resultado = aplicarWebhookWhatsApp(db, payloadMalicioso, '2026-08-15T12:00:30.000Z');
assert.equal(resultado.mensagensNovas, 1);
assert.equal(db.leads.length, 1);

resultado = aplicarWebhookWhatsApp(db, payload, '2026-08-15T12:01:00.000Z');
assert.equal(resultado.mensagensNovas, 0, 'o mesmo ID da Meta não pode duplicar a mensagem');
assert.equal(db.leads.length, 1);
assert.equal(db.leads[0].interacoes.length, 2);

const segredo = 'segredo-de-teste';
const rawBody = Buffer.from(JSON.stringify(payload));
const assinatura = `sha256=${crypto.createHmac('sha256', segredo).update(rawBody).digest('hex')}`;
assert.equal(assinaturaValida(rawBody, assinatura, segredo), true);
assert.equal(assinaturaValida(rawBody, assinatura.replace(/.$/, '0'), segredo), false);

const payloadSaida = payloadMensagemTexto('(31) 98888-7777', 'Olá, como posso ajudar?');
assert.equal(payloadSaida.to, '5531988887777');
assert.equal(payloadSaida.text.body, 'Olá, como posso ajudar?');
assert.equal(telefoneDestino('5531988887777'), '5531988887777');

const leadSaida = { id: 7, etapa: 'Novo lead', interacoes: [] };
registrarMensagemSaida(leadSaida, { idMensagem: 'wamid.saida', texto: 'Resposta', criadoEm: '2026-08-15T13:00:00.000Z' });
assert.equal(leadSaida.interacoes[0].direcao, 'saida');
assert.equal(leadSaida.etapa, 'Em contato');

(async () => {
  let requisicao;
  const resultadoEnvio = await enviarMensagemTexto({
    telefone: '5531988887777',
    texto: 'Mensagem de teste',
    phoneNumberId: '123456789',
    accessToken: 'token-de-teste',
    fetchImpl: async (url, opcoes) => {
      requisicao = { url, opcoes };
      return { ok: true, json: async () => ({ contacts: [{ wa_id: '5531988887777' }], messages: [{ id: 'wamid.confirmada' }] }) };
    },
  });
  assert.equal(resultadoEnvio.idMensagem, 'wamid.confirmada');
  assert.match(requisicao.url, /\/123456789\/messages$/);
  assert.equal(JSON.parse(requisicao.opcoes.body).text.body, 'Mensagem de teste');
  assert.equal(requisicao.opcoes.headers.Authorization, 'Bearer token-de-teste');
  console.log('Testes da integração WhatsApp passaram.');
})().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
