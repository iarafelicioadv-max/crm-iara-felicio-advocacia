// Automação do Google Drive para o CRM Iara Advocacia.
// Configure em "Configurações do projeto > Propriedades do script":
// CLIENTES_FOLDER_ID = ID da pasta CLIENTES
// SYNC_SECRET = a mesma chave secreta cadastrada na Render

function respostaJson(dados) {
  return ContentService
    .createTextOutput(JSON.stringify(dados))
    .setMimeType(ContentService.MimeType.JSON);
}

function nomeSeguro(valor) {
  return String(valor || '')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150)
    .toUpperCase();
}

function pastaClientes() {
  var id = PropertiesService.getScriptProperties().getProperty('CLIENTES_FOLDER_ID');
  if (!id) throw new Error('CLIENTES_FOLDER_ID não configurado nas propriedades do script');
  return DriveApp.getFolderById(id);
}

function garantirPastaCliente(nomeCliente, clienteId) {
  var nome = nomeSeguro(nomeCliente);
  if (!nome) throw new Error('Nome da cliente não informado');
  var raiz = pastaClientes();
  var pastas = raiz.getFoldersByName(nome);
  var pasta = pastas.hasNext() ? pastas.next() : raiz.createFolder(nome);
  if (clienteId && !pasta.getDescription()) pasta.setDescription('CRM_CLIENTE_ID=' + clienteId);
  return pasta;
}

function localizarDocumento(pasta, nome, documentoId) {
  var arquivos = pasta.getFilesByName(nome);
  var marcador = 'CRM_DOCUMENTO_ID=' + documentoId;
  while (arquivos.hasNext()) {
    var arquivo = arquivos.next();
    if (arquivo.getDescription() === marcador) return arquivo;
  }
  return null;
}

function doPost(e) {
  try {
    var dados = JSON.parse(e.postData.contents || '{}');
    var segredoEsperado = PropertiesService.getScriptProperties().getProperty('SYNC_SECRET');
    if (!segredoEsperado || dados.segredo !== segredoEsperado) return respostaJson({ ok: false, erro: 'Chave de sincronização inválida' });

    if (dados.acao === 'garantirPastaCliente') {
      var pasta = garantirPastaCliente(dados.nomeCliente, dados.clienteId);
      return respostaJson({ ok: true, pastaId: pasta.getId(), pastaUrl: pasta.getUrl(), nome: pasta.getName() });
    }

    if (dados.acao === 'enviarDocumento') {
      var pastaDocumento = DriveApp.getFolderById(dados.pastaId);
      var existente = localizarDocumento(pastaDocumento, dados.nome, dados.documentoId);
      var arquivo = existente;
      if (!arquivo) {
        var bytes = Utilities.base64Decode(dados.conteudoBase64);
        var blob = Utilities.newBlob(bytes, dados.mimetype || 'application/octet-stream', dados.nome || 'Documento');
        arquivo = pastaDocumento.createFile(blob);
        arquivo.setDescription('CRM_DOCUMENTO_ID=' + dados.documentoId);
      }
      return respostaJson({ ok: true, arquivoId: arquivo.getId(), arquivoUrl: arquivo.getUrl(), nome: arquivo.getName(), existente: !!existente });
    }

    return respostaJson({ ok: false, erro: 'Ação não reconhecida' });
  } catch (erro) {
    return respostaJson({ ok: false, erro: String(erro && erro.message ? erro.message : erro) });
  }
}
