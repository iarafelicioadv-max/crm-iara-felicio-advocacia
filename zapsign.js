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
  const idProcuracao = /^crm-procuracao-(\d+)$/i.test(externalId) ? Number(externalId.match(/(\d+)$/)[1]) : null;
  return {
    evento: evento || 'atualizacao',
    token,
    externalId,
    idContrato,
    idProcuracao,
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
  const procuracao = (db.documentos || []).find((item) =>
    item.tipo === 'Procuração' && (
      (evento.token && item.zapsignToken === evento.token) ||
      (evento.idProcuracao && item.id === evento.idProcuracao)
    )
  );
  if (!contrato && !procuracao) return { aplicado: false, motivo: 'documento não localizado', evento };

  if (procuracao) {
    procuracao.zapsignToken = evento.token || procuracao.zapsignToken || null;
    procuracao.zapsignStatus = evento.status || procuracao.zapsignStatus || 'Aguardando assinatura';
    procuracao.zapsignDocumentoNome = evento.nome || procuracao.zapsignDocumentoNome || null;
    procuracao.zapsignUltimoEvento = evento.evento;
    procuracao.zapsignUltimoEventoEm = agora;
    if (evento.status === 'Assinado') {
      procuracao.zapsignAssinadoEm = evento.assinadoEm || procuracao.zapsignAssinadoEm || agora;
      procuracao.statusAssinatura = 'Assinado';
    }
  }

  if (contrato) {
    contrato.zapsignToken = evento.token || contrato.zapsignToken || null;
    contrato.zapsignStatus = evento.status || contrato.zapsignStatus || 'Aguardando assinatura';
    contrato.zapsignDocumentoNome = evento.nome || contrato.zapsignDocumentoNome || null;
    contrato.zapsignUltimoEvento = evento.evento;
    contrato.zapsignUltimoEventoEm = agora;
    if (evento.status === 'Assinado') {
      contrato.zapsignAssinadoEm = evento.assinadoEm || contrato.zapsignAssinadoEm || agora;
      contrato.statusAssinatura = 'Assinado';
    }
  }

  if (!db.integracoes) db.integracoes = {};
  db.integracoes.zapsign = {
    ...(db.integracoes.zapsign || {}),
    ultimoWebhookEm: agora,
    ultimoEvento: evento.evento,
    ultimoDocumentoToken: evento.token || null,
  };
  return {
    aplicado: true,
    contrato: contrato || null,
    procuracao: procuracao || null,
    recurso: contrato ? 'contratos' : 'documentos',
    item: contrato || procuracao,
    evento,
  };
}

function segredoValido(recebido, esperado) {
  const a = Buffer.from(valorTexto(recebido));
  const b = Buffer.from(valorTexto(esperado));
  return a.length > 0 && a.length === b.length && require('crypto').timingSafeEqual(a, b);
}

async function confirmarEventoZapSignPorApi(payload, contratos, apiToken, fetchImpl = fetch, documentos = []) {
  const evento = extrairEventoZapSign(payload);
  if (!evento.token) return { confirmado: false, motivo: 'documento sem token', evento };
  const vinculado = (contratos || []).some((item) => item.zapsignToken === evento.token) ||
    (documentos || []).some((item) => item.tipo === 'Procuração' && item.zapsignToken === evento.token);
  if (!vinculado) {
    return { confirmado: false, motivo: 'documento não vinculado', evento };
  }
  if (!valorTexto(apiToken)) return { confirmado: false, motivo: 'API da ZapSign não configurada', evento };

  const resposta = await fetchImpl(`https://api.zapsign.com.br/api/v1/docs/${encodeURIComponent(evento.token)}/`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  if (!resposta.ok) {
    return { confirmado: false, motivo: `a ZapSign respondeu ${resposta.status}`, evento, tentarNovamente: resposta.status >= 500 };
  }
  const documento = await resposta.json();
  if (valorTexto(documento.token) !== evento.token) {
    return { confirmado: false, motivo: 'token divergente na confirmação', evento };
  }
  return {
    confirmado: true,
    evento,
    payload: { event_type: evento.evento || 'doc_refreshed', document: documento },
  };
}

function telefoneZapSign(valor) {
  let digitos = valorTexto(valor).replace(/\D/g, '');
  if (digitos.startsWith('55') && digitos.length >= 12) digitos = digitos.slice(2);
  return digitos.length >= 10 ? { phone_country: '55', phone_number: digitos } : {};
}

async function criarProcuracaoZapSign({ pdf, documentoId, cliente, apiToken, fetchImpl = fetch }) {
  if (!valorTexto(apiToken)) throw new Error('adicione o token da API da ZapSign na Render');
  if (!Buffer.isBuffer(pdf) || !pdf.length) throw new Error('o PDF da procuração não foi gerado');
  const nome = valorTexto(cliente && cliente.nome);
  if (!nome) throw new Error('o nome da cliente é obrigatório para a ZapSign');
  const email = valorTexto(cliente.email);
  const telefone = telefoneZapSign(cliente.telefone);
  const signatario = {
    name: nome,
    external_id: `crm-cliente-${cliente.id}`,
    send_automatic_email: !!email,
    send_automatic_whatsapp: false,
    blank_email: !email,
    blank_phone: !telefone.phone_number,
    ...(email ? { email } : {}),
    ...telefone,
  };
  const resposta = await fetchImpl('https://api.zapsign.com.br/api/v1/docs/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `PROCURAÇÃO - ${nome}`.slice(0, 255),
      base64_pdf: pdf.toString('base64'),
      signers: [signatario],
      lang: 'pt-br',
      external_id: `crm-procuracao-${documentoId}`,
      folder_path: '/CRM Iara/Procurações/',
      brand_name: 'Iara Vieira Felício Advocacia',
      disable_signer_emails: !email,
      signature_order_active: false,
      allow_refuse_signature: true,
    }),
  });
  const retorno = await resposta.json().catch(() => ({}));
  if (!resposta.ok || !retorno.token) {
    const detalhe = valorTexto(retorno.detail || retorno.message || retorno.error);
    throw new Error(`a ZapSign não criou a procuração${detalhe ? `: ${detalhe}` : ` (HTTP ${resposta.status})`}`);
  }
  const signatarioCriado = Array.isArray(retorno.signers) ? retorno.signers[0] || {} : {};
  return {
    token: retorno.token,
    status: valorTexto(retorno.status) || 'Aguardando assinatura',
    signUrl: valorTexto(signatarioCriado.sign_url || signatarioCriado.url || retorno.sign_url) || null,
    envioAutomaticoEmail: !!email,
  };
}

module.exports = {
  extrairEventoZapSign,
  aplicarEventoZapSign,
  segredoValido,
  confirmarEventoZapSignPorApi,
  criarProcuracaoZapSign,
  telefoneZapSign,
};
