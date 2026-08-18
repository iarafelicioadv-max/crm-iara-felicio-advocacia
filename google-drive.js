function nomePastaCliente(nome) {
  return String(nome || '')
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150)
    .toLocaleUpperCase('pt-BR');
}

function configuracaoDriveValida(env = process.env) {
  return !!(
    /^https:\/\/script\.google\.com\/macros\/s\//.test(String(env.GOOGLE_DRIVE_WEBHOOK_URL || '').trim()) &&
    String(env.GOOGLE_DRIVE_SYNC_SECRET || '').trim()
  );
}

class GoogleDriveCRM {
  constructor({ webhookUrl, syncSecret, fetchImpl = global.fetch }) {
    this.webhookUrl = String(webhookUrl || '').trim();
    this.syncSecret = String(syncSecret || '').trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\//.test(this.webhookUrl)) throw new Error('a URL da automação do Google Drive é inválida');
    if (!this.syncSecret) throw new Error('a chave de sincronização do Google Drive não foi configurada');
    if (typeof fetchImpl !== 'function') throw new Error('cliente HTTP indisponível');
    this.fetch = fetchImpl;
  }

  async requisitar(acao, dados = {}) {
    const resposta = await this.fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ segredo: this.syncSecret, acao, ...dados }),
      redirect: 'follow',
    });
    const retorno = await resposta.json().catch(() => ({}));
    if (!resposta.ok || !retorno.ok) {
      const erro = new Error(retorno.erro || 'a automação do Google Drive recusou a operação');
      erro.statusCode = resposta.status >= 500 ? 502 : 400;
      throw erro;
    }
    return retorno;
  }

  async garantirPastaCliente(nomeCliente, clienteId) {
    const nome = nomePastaCliente(nomeCliente);
    if (!nome) throw new Error('o cliente precisa ter um nome para criar a pasta');
    const retorno = await this.requisitar('garantirPastaCliente', {
      clienteId: String(clienteId || ''),
      nomeCliente: nome,
    });
    return { id: retorno.pastaId, name: retorno.nome, webViewLink: retorno.pastaUrl };
  }

  async enviarDocumento({ pastaId, documentoId, nome, mimetype, buffer }) {
    const retorno = await this.requisitar('enviarDocumento', {
      pastaId,
      documentoId: String(documentoId),
      nome: String(nome || 'Documento'),
      mimetype: mimetype || 'application/octet-stream',
      conteudoBase64: Buffer.from(buffer).toString('base64'),
    });
    return { id: retorno.arquivoId, name: retorno.nome, webViewLink: retorno.arquivoUrl };
  }
}

function criarDrivePeloAmbiente(env = process.env, opcoes = {}) {
  if (!configuracaoDriveValida(env)) return null;
  return new GoogleDriveCRM({
    webhookUrl: env.GOOGLE_DRIVE_WEBHOOK_URL,
    syncSecret: env.GOOGLE_DRIVE_SYNC_SECRET,
    ...opcoes,
  });
}

module.exports = {
  GoogleDriveCRM,
  configuracaoDriveValida,
  criarDrivePeloAmbiente,
  nomePastaCliente,
};
