const crypto = require('crypto');

function somenteDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function telefoneLocal(valor) {
  const digitos = somenteDigitos(valor);
  return digitos.startsWith('55') && digitos.length >= 12 ? digitos.slice(2) : digitos;
}

function telefonesIguais(a, b) {
  const aLocal = telefoneLocal(a);
  const bLocal = telefoneLocal(b);
  return !!aLocal && !!bLocal && aLocal === bLocal;
}

function textoMensagem(mensagem) {
  if (!mensagem) return '';
  if (mensagem.text && mensagem.text.body) return mensagem.text.body;
  if (mensagem.button) return mensagem.button.text || mensagem.button.payload || '[Botão]';
  if (mensagem.interactive && mensagem.interactive.button_reply) return mensagem.interactive.button_reply.title || mensagem.interactive.button_reply.id || '[Botão]';
  if (mensagem.interactive && mensagem.interactive.list_reply) return mensagem.interactive.list_reply.title || mensagem.interactive.list_reply.id || '[Opção de lista]';
  if (mensagem.image) return mensagem.image.caption || '[Imagem]';
  if (mensagem.document) return mensagem.document.caption || mensagem.document.filename || '[Documento]';
  if (mensagem.video) return mensagem.video.caption || '[Vídeo]';
  if (mensagem.audio) return '[Áudio]';
  if (mensagem.sticker) return '[Figurinha]';
  if (mensagem.location) return '[Localização]';
  if (mensagem.contacts) return '[Contato]';
  return `[${mensagem.type || 'Mensagem'}]`;
}

function dataMensagem(timestamp, agora) {
  const segundos = Number(timestamp);
  return Number.isFinite(segundos) && segundos > 0
    ? new Date(segundos * 1000).toISOString()
    : agora;
}

function proximoId(lista) {
  return lista.length ? Math.max(...lista.map((item) => Number(item.id) || 0)) + 1 : 1;
}

function encontrarInteracao(db, idMensagem) {
  for (const lead of db.leads || []) {
    const interacao = (lead.interacoes || []).find((item) => item.idMensagem === idMensagem);
    if (interacao) return { lead, interacao };
  }
  return null;
}

function aplicarWebhookWhatsApp(db, payload, agora = new Date().toISOString()) {
  if (!Array.isArray(db.leads)) db.leads = [];
  if (!Array.isArray(db.auditoria)) db.auditoria = [];
  let mensagensNovas = 0;
  let leadsCriados = 0;
  let statusAtualizados = 0;

  for (const entry of payload && Array.isArray(payload.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
      const value = change.value || {};
      const contatos = Array.isArray(value.contacts) ? value.contacts : [];

      for (const mensagem of Array.isArray(value.messages) ? value.messages : []) {
        if (!mensagem.id || encontrarInteracao(db, mensagem.id)) continue;
        const telefone = somenteDigitos(mensagem.from);
        if (!telefone) continue;
        const contato = contatos.find((item) => telefonesIguais(item.wa_id, telefone));
        const nomeInformado = contato && contato.profile && contato.profile.name;
        let lead = db.leads.find((item) => telefonesIguais(item.telefone, telefone));

        if (!lead) {
          lead = {
            id: proximoId(db.leads),
            nome: nomeInformado || `Contato WhatsApp • ${telefone.slice(-4)}`,
            telefone,
            whatsappWaId: telefone,
            origem: 'WhatsApp Business (API oficial)',
            etapa: 'Novo lead',
            criadoEm: agora,
            interacoes: [],
            naoLidas: 0,
          };
          db.leads.push(lead);
          leadsCriados += 1;
        }

        if (!Array.isArray(lead.interacoes)) lead.interacoes = [];
        const recebidoEm = dataMensagem(mensagem.timestamp, agora);
        const texto = textoMensagem(mensagem);
        lead.whatsappWaId = telefone;
        if (nomeInformado) lead.whatsappProfileName = nomeInformado;
        lead.interacoes.push({
          idMensagem: mensagem.id,
          tipo: mensagem.type || 'unknown',
          texto,
          direcao: 'entrada',
          status: 'recebida',
          criadoEm: recebidoEm,
        });
        lead.interacoes = lead.interacoes.slice(-200);
        lead.ultimaMensagem = texto;
        lead.ultimaInteracaoEm = recebidoEm;
        lead.naoLidas = Number(lead.naoLidas || 0) + 1;
        mensagensNovas += 1;
      }

      for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
        if (!status.id) continue;
        const encontrado = encontrarInteracao(db, status.id);
        if (!encontrado) continue;
        encontrado.interacao.status = status.status || encontrado.interacao.status;
        encontrado.interacao.statusEm = dataMensagem(status.timestamp, agora);
        if (Array.isArray(status.errors) && status.errors.length) {
          encontrado.interacao.erro = status.errors.map((erro) => erro.title || erro.message || erro.code).join('; ');
        }
        statusAtualizados += 1;
      }
    }
  }

  if (mensagensNovas) {
    db.auditoria.push({
      id: proximoId(db.auditoria),
      usuarioId: null,
      usuarioNome: 'WhatsApp Business',
      acao: 'recebeu',
      recurso: 'leads',
      recursoId: null,
      detalhes: `${mensagensNovas} mensagem(ns); ${leadsCriados} novo(s) lead(s)`,
      criadoEm: agora,
    });
    if (db.auditoria.length > 1000) db.auditoria = db.auditoria.slice(-1000);
  }

  return { mensagensNovas, leadsCriados, statusAtualizados };
}

function assinaturaValida(rawBody, assinatura, appSecret) {
  if (!Buffer.isBuffer(rawBody) || !assinatura || !appSecret) return false;
  const esperada = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  const recebidaBuffer = Buffer.from(String(assinatura));
  const esperadaBuffer = Buffer.from(esperada);
  return recebidaBuffer.length === esperadaBuffer.length && crypto.timingSafeEqual(recebidaBuffer, esperadaBuffer);
}

module.exports = {
  somenteDigitos,
  telefonesIguais,
  textoMensagem,
  aplicarWebhookWhatsApp,
  assinaturaValida,
};
