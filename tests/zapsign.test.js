'use strict';

const assert = require('assert');
const { extrairEventoZapSign, aplicarEventoZapSign, segredoValido, confirmarEventoZapSignPorApi } = require('../zapsign');

const payload = {
  event_type: 'doc_signed',
  document: {
    token: 'documento-teste',
    status: 'signed',
    name: 'Contrato assinado',
    signed_at: '2026-08-17T18:00:00Z',
    signed_file: 'https://arquivo-temporario.exemplo/contrato.pdf',
  },
};
const evento = extrairEventoZapSign(payload);
assert.strictEqual(evento.status, 'Assinado');
assert.strictEqual(evento.recebeuArquivoAssinadoTemporario, true);

const db = { contratos: [{ id: 1, zapsignToken: 'documento-teste' }], integracoes: {} };
const resultado = aplicarEventoZapSign(db, payload, '2026-08-17T18:01:00Z');
assert.strictEqual(resultado.aplicado, true);
assert.strictEqual(db.contratos[0].zapsignStatus, 'Assinado');
assert.strictEqual(db.contratos[0].statusAssinatura, 'Assinado');
assert.strictEqual(db.integracoes.zapsign.ultimoEvento, 'doc_signed');
assert.strictEqual(Object.values(db.contratos[0]).some((v) => String(v).includes('arquivo-temporario')), false, 'URL temporária não deve ser persistida');
assert.strictEqual(segredoValido('segredo-forte', 'segredo-forte'), true);
assert.strictEqual(segredoValido('invalido', 'segredo-forte'), false);

(async () => {
  let autorizacao = null;
  const confirmado = await confirmarEventoZapSignPorApi(
    payload,
    db.contratos,
    'token-api-teste',
    async (url, opcoes) => {
      autorizacao = opcoes.headers.Authorization;
      assert.ok(url.endsWith('/documento-teste/'));
      return {
        ok: true,
        status: 200,
        async json() {
          return { token: 'documento-teste', status: 'signed', name: 'Contrato confirmado pela API' };
        },
      };
    }
  );
  assert.strictEqual(confirmado.confirmado, true);
  assert.strictEqual(confirmado.payload.document.status, 'signed');
  assert.strictEqual(autorizacao, 'Bearer token-api-teste');

  const desconhecido = await confirmarEventoZapSignPorApi(
    { event_type: 'doc_signed', document: { token: 'outro-documento' } },
    db.contratos,
    'token-api-teste',
    async () => { throw new Error('não deveria consultar a API'); }
  );
  assert.strictEqual(desconhecido.confirmado, false);
  assert.strictEqual(desconhecido.motivo, 'documento não vinculado');

  console.log('OK: eventos e proteção do webhook ZapSign validados.');
})().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
