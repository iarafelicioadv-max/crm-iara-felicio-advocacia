'use strict';

function valorTexto(valor) {
  return String(valor || '').trim();
}

function extrairEventoZapSign(payload = {}) {
  const evento = valorTexto(payload.event_type || payload.type || payload.event || payload.event_name).toLowerCase();
  const documento = payload.document || payload.doc || payload;
  const token = valorTexto(documento.token || payload.doc_token || payload.document_token);
  const externalId = valorTexto(documento.external_id || payload.external_id);
  const statusOriginal = valorTexto(documento.status || payload.status).toLowerCase();
  const mapa = {
    signed: 'Assinado',
    pending: 'Aguardando assinatura',
    refused: 'Recusado',
    expired: 'Expirado',
    deleted: 'Excluído',
  };
  let status = mapa[statusOriginal] || statusOriginal || null;
  if (evento.includes('signed')) status = 'Assinado';
  if (evento.includes('refused')) status = 'Recusado';
  if (evento.includes('expired')) status = 'Expirado';
  if (evento.includes('deleted')) status = 'Excluído';
  const idContrato = /^crm-contrato-(\d+)$/i.test(externalId) ? Number(externalId.match(/(\d+)$/)[1]) : null;
  return {
    evento: evento || 'atualizacao',
    token,
    externalId,
    idContrato,
    status,
    nome: valorTexto(documento.name || documento.nome),
    assinadoEm: documento.signed_at || documento.last_update_at || payload.signed_at || null,
    recebeuArquivoAssinadoTemporario: !!(documento.signed_file || payload.signed_file),
  };
}

function aplicarEventoZapSign(db, payload, agora = new Date().toISOString()) {
  const evento = extrairEventoZapSign(payload);
  const contrato = (db.contratos || []).find((item) =>
    (evento.token && item.zapsignToken === evento.token) ||
    (evento.idContrato && item.id === evento.idContrato)
  );
  if (!contrato) return { aplicado: false, motivo: 'contrato não localizado', evento };

  contrato.zapsignToken = evento.token || contrato.zapsignToken || null;
  contrato.zapsignStatus = evento.status || contrato.zapsignStatus || 'Aguardando assinatura';
  contrato.zapsignDocumentoNome = evento.nome || contrato.zapsignDocumentoNome || null;
  contrato.zapsignUltimoEvento = evento.evento;
  contrato.zapsignUltimoEventoEm = agora;
  if (evento.status === 'Assinado') {
    contrato.zapsignAssinadoEm = evento.assinadoEm || contrato.zapsignAssinadoEm || agora;
    contrato.statusAssinatura = 'Assinado';
  }

  if (!db.integracoes) db.integracoes = {};
  db.integracoes.zapsign = {
    ...(db.integracoes.zapsign || {}),
    ultimoWebhookEm: agora,
    ultimoEvento: evento.evento,
    ultimoDocumentoToken: evento.token || null,
  };
  return { aplicado: true, contrato, evento };
}

function segredoValido(recebido, esperado) {
  const a = Buffer.from(valorTexto(recebido));
  const b = Buffer.from(valorTexto(esperado));
  return a.length > 0 && a.length === b.length && require('crypto').timingSafeEqual(a, b);
}

module.exports = { extrairEventoZapSign, aplicarEventoZapSign, segredoValido };
