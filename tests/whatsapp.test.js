const assert = require('assert');
const crypto = require('crypto');
const { aplicarWebhookWhatsApp, assinaturaValida, telefonesIguais, textoMensagem } = require('../whatsapp');

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

console.log('Testes da integração WhatsApp passaram.');
