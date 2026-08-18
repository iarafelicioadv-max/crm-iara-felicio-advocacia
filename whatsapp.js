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

function configuracaoEnvioValida({ phoneNumberId, accessToken }) {
  return !!(somenteDigitos(phoneNumberId) && String(accessToken || '').trim());
}

function telefoneDestino(valor) {
  const digitos = somenteDigitos(valor);
  if (digitos && !digitos.startsWith('55') && (digitos.length === 10 || digitos.length === 11)) return `55${digitos}`;
  return digitos;
}

function payloadMensagemTexto(telefone, texto) {
  const destino = telefoneDestino(telefone);
  const conteudo = String(texto || '').trim();
  if (!destino) throw new Error('o lead não possui um telefone válido');
  if (!conteudo) throw new Error('digite uma mensagem');
  if (conteudo.length > 4096) throw new Error('a mensagem deve ter no máximo 4.096 caracteres');
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: destino,
    type: 'text',
    text: { preview_url: false, body: conteudo },
  };
}

async function enviarMensagemTexto({ telefone, texto, phoneNumberId, accessToken, apiVersion = 'v26.0', fetchImpl = global.fetch }) {
  if (!configuracaoEnvioValida({ phoneNumberId, accessToken })) {
    const erro = new Error('o envio pelo WhatsApp ainda não foi configurado');
    erro.statusCode = 503;
    throw erro;
  }
  if (typeof fetchImpl !== 'function') throw new Error('cliente HTTP indisponível');

  const versao = /^v\d+\.\d+$/.test(String(apiVersion)) ? String(apiVersion) : 'v26.0';
  const payload = payloadMensagemTexto(telefone, texto);
  const resposta = await fetchImpl(`https://graph.facebook.com/${versao}/${somenteDigitos(phoneNumberId)}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${String(accessToken).trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const erro = new Error((dados.error && (dados.error.error_user_msg || dados.error.message)) || 'a Meta recusou o envio da mensagem');
    erro.statusCode = resposta.status >= 400 && resposta.status < 500 ? 400 : 502;
    erro.metaCode = dados.error && dados.error.code;
    throw erro;
  }
  const idMensagem = dados.messages && dados.messages[0] && dados.messages[0].id;
  if (!idMensagem) {
    const erro = new Error('a Meta não confirmou o identificador da mensagem enviada');
    erro.statusCode = 502;
    throw erro;
  }
  return { idMensagem, destinatario: dados.contacts && dados.contacts[0] ? dados.contacts[0].wa_id : payload.to };
}

function registrarMensagemSaida(lead, { idMensagem, texto, criadoEm = new Date().toISOString() }) {
  if (!lead) throw new Error('lead não encontrado');
  if (!Array.isArray(lead.interacoes)) lead.interacoes = [];
  const interacao = {
    idMensagem,
    tipo: 'text',
    texto: String(texto || '').trim(),
    direcao: 'saida',
    status: 'enviada',
    criadoEm,
  };
  lead.interacoes.push(interacao);
  lead.interacoes = lead.interacoes.slice(-200);
  lead.ultimaMensagem = interacao.texto;
  lead.ultimaInteracaoEm = criadoEm;
  if (lead.etapa === 'Novo lead') lead.etapa = 'Em contato';
  return interacao;
}

module.exports = {
  somenteDigitos,
  telefonesIguais,
  textoMensagem,
  aplicarWebhookWhatsApp,
  assinaturaValida,
  configuracaoEnvioValida,
  telefoneDestino,
  payloadMensagemTexto,
  enviarMensagemTexto,
  registrarMensagemSaida,
};
