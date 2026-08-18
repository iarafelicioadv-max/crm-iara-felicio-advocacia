// Automação do Google Drive para o CRM Iara Advocacia.
// Configure em "Configurações do projeto > Propriedades do script":
// CLIENTES_FOLDER_ID = ID da pasta CLIENTES
// SYNC_SECRET = a mesma chave secreta cadastrada na Render
//
// Padrão documental do escritório:
// - 01 fica reservado para a PETIÇÃO INICIAL;
// - os documentos de instrução começam em 02;
// - o CONTRATO DE HONORÁRIOS fica em subpasta própria e não entra na numeração;
// - os originais são preservados antes da conversão/renomeação.

var PASTA_CONTRATO = 'CONTRATO DE HONORÁRIOS';
var PASTA_PETICAO = 'PETIÇÃO INICIAL';
var PASTA_ORIGINAIS = 'ORIGINAIS';
var PASTA_AUDITORIA = 'AUDITORIA';
var MARCADOR_DOCUMENTO = 'CRM_DOCUMENTO_ID=';

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

function obterOuCriarSubpasta(pastaPai, nome) {
  var pastas = pastaPai.getFoldersByName(nome);
  return pastas.hasNext() ? pastas.next() : pastaPai.createFolder(nome);
}

function garantirEstruturaRotina(pastaCliente) {
  var contrato = obterOuCriarSubpasta(pastaCliente, PASTA_CONTRATO);
  var peticao = obterOuCriarSubpasta(pastaCliente, PASTA_PETICAO);
  var originais = obterOuCriarSubpasta(pastaCliente, PASTA_ORIGINAIS);
  var auditoria = obterOuCriarSubpasta(pastaCliente, PASTA_AUDITORIA);
  return {
    contratoId: contrato.getId(),
    contratoUrl: contrato.getUrl(),
    peticaoId: peticao.getId(),
    peticaoUrl: peticao.getUrl(),
    originaisId: originais.getId(),
    originaisUrl: originais.getUrl(),
    auditoriaId: auditoria.getId(),
    auditoriaUrl: auditoria.getUrl()
  };
}

function garantirPastaCliente(nomeCliente, clienteId) {
  var nome = nomeSeguro(nomeCliente);
  if (!nome) throw new Error('Nome da cliente não informado');
  var raiz = pastaClientes();
  var pastas = raiz.getFoldersByName(nome);
  var pasta = pastas.hasNext() ? pastas.next() : raiz.createFolder(nome);
  if (clienteId && !pasta.getDescription()) pasta.setDescription('CRM_CLIENTE_ID=' + clienteId);
  var estrutura = garantirEstruturaRotina(pasta);
  garantirMonitorRotinaDocumental();
  return { pasta: pasta, estrutura: estrutura };
}

function metadadosDocumento(descricao) {
  var retorno = {};
  String(descricao || '').split('\n').forEach(function (linha) {
    var posicao = linha.indexOf('=');
    if (posicao <= 0) return;
    retorno[linha.slice(0, posicao)] = linha.slice(posicao + 1);
  });
  return retorno;
}

function descricaoDocumento(dados) {
  return [
    MARCADOR_DOCUMENTO + String(dados.documentoId || ''),
    'CRM_ORDEM=' + String(dados.ordemPreferencial || 999),
    'CRM_ROTULO=' + nomeSeguro(dados.nome || 'DOCUMENTO'),
    'CRM_CLIENTE=' + nomeSeguro(dados.nomeCliente || '')
  ].join('\n');
}

function localizarDocumento(pasta, documentoId) {
  var marcador = MARCADOR_DOCUMENTO + String(documentoId);
  var arquivos = pasta.getFiles();
  while (arquivos.hasNext()) {
    var arquivo = arquivos.next();
    if (String(arquivo.getDescription() || '').indexOf(marcador) >= 0) return arquivo;
  }
  return null;
}

function extensaoDoNome(nome) {
  var correspondencia = String(nome || '').match(/(\.[A-Za-z0-9]{1,8})$/);
  return correspondencia ? correspondencia[1].toLowerCase() : '';
}

function blobFinalEmPdf(blob, nomeBase) {
  if (String(blob.getContentType() || '').toLowerCase() === 'application/pdf') {
    blob.setName(nomeBase + '.pdf');
    return { blob: blob, extensao: '.pdf', status: 'PDF original' };
  }
  try {
    var pdf = blob.getAs(MimeType.PDF);
    pdf.setName(nomeBase + '.pdf');
    return { blob: pdf, extensao: '.pdf', status: 'Convertido para PDF' };
  } catch (erro) {
    var extensao = extensaoDoNome(blob.getName()) || '';
    blob.setName(nomeBase + extensao);
    return { blob: blob, extensao: extensao, status: 'Conversão pendente' };
  }
}

function renumerarDocumentosPeticao(pastaPeticao, nomeCliente) {
  var arquivos = pastaPeticao.getFiles();
  var gerenciados = [];
  while (arquivos.hasNext()) {
    var arquivo = arquivos.next();
    var metadados = metadadosDocumento(arquivo.getDescription());
    if (!metadados.CRM_DOCUMENTO_ID) continue;
    gerenciados.push({
      arquivo: arquivo,
      ordem: Number(metadados.CRM_ORDEM || 999),
      rotulo: nomeSeguro(metadados.CRM_ROTULO || arquivo.getName()),
      cliente: nomeSeguro(metadados.CRM_CLIENTE || nomeCliente),
      criadoEm: arquivo.getDateCreated().getTime()
    });
  }

  gerenciados.sort(function (a, b) {
    if (a.ordem !== b.ordem) return a.ordem - b.ordem;
    if (a.criadoEm !== b.criadoEm) return a.criadoEm - b.criadoEm;
    return a.arquivo.getId() < b.arquivo.getId() ? -1 : 1;
  });

  gerenciados.forEach(function (item, indice) {
    var numero = String(indice + 2).padStart(2, '0');
    var extensao = extensaoDoNome(item.arquivo.getName()) || '.pdf';
    item.arquivo.setName(numero + ' - ' + item.rotulo + ' - ' + item.cliente + extensao);
  });
}

function salvarDocumentoRotina(dados) {
  var pastaCliente = DriveApp.getFolderById(dados.pastaId);
  var estrutura = garantirEstruturaRotina(pastaCliente);
  var pastaOriginais = DriveApp.getFolderById(estrutura.originaisId);
  var pastaPeticao = DriveApp.getFolderById(estrutura.peticaoId);
  var pastaContrato = DriveApp.getFolderById(estrutura.contratoId);
  var descricao = descricaoDocumento(dados);
  var bytes = Utilities.base64Decode(dados.conteudoBase64);
  var blobOriginal = Utilities.newBlob(bytes, dados.mimetype || 'application/octet-stream', dados.nomeOriginal || dados.nome || 'Documento');

  var original = localizarDocumento(pastaOriginais, dados.documentoId);
  if (!original) {
    original = pastaOriginais.createFile(blobOriginal.copyBlob());
    original.setName(dados.nomeOriginal || dados.nome || 'Documento');
    original.setDescription(descricao);
  }

  if (dados.destino === 'CONTRATO_HONORARIOS') {
    var contrato = localizarDocumento(pastaContrato, dados.documentoId);
    var contratoStatus = 'Já existente';
    if (!contrato) {
      var contratoPdf = blobFinalEmPdf(blobOriginal.copyBlob(), 'CONTRATO DE HONORÁRIOS - ' + nomeSeguro(dados.nomeCliente));
      contrato = pastaContrato.createFile(contratoPdf.blob);
      contrato.setDescription(descricao);
      contratoStatus = contratoPdf.status;
    }
    return { arquivo: contrato, original: original, conversaoStatus: contratoStatus, estrutura: estrutura };
  }

  var final = localizarDocumento(pastaPeticao, dados.documentoId);
  var conversaoStatus = 'Já existente';
  if (!final) {
    var nomeBase = nomeSeguro(dados.nome || 'DOCUMENTO') + ' - ' + nomeSeguro(dados.nomeCliente || pastaCliente.getName());
    var convertido = blobFinalEmPdf(blobOriginal.copyBlob(), nomeBase);
    final = pastaPeticao.createFile(convertido.blob);
    final.setDescription(descricao);
    conversaoStatus = convertido.status;
  }
  renumerarDocumentosPeticao(pastaPeticao, dados.nomeCliente || pastaCliente.getName());
  return { arquivo: final, original: original, conversaoStatus: conversaoStatus, estrutura: estrutura };
}

function monitorarNovasPastasClientes() {
  var pastas = pastaClientes().getFolders();
  while (pastas.hasNext()) garantirEstruturaRotina(pastas.next());
}

function garantirMonitorRotinaDocumental() {
  try {
    var existe = ScriptApp.getProjectTriggers().some(function (gatilho) {
      return gatilho.getHandlerFunction() === 'monitorarNovasPastasClientes';
    });
    if (!existe) ScriptApp.newTrigger('monitorarNovasPastasClientes').timeBased().everyMinutes(10).create();
    return true;
  } catch (erro) {
    // A criação imediata pelo CRM continua funcionando mesmo se a conta ainda
    // não tiver autorizado gatilhos instaláveis. A função pode ser executada
    // manualmente uma vez no editor para concluir essa autorização.
    return false;
  }
}

function doPost(e) {
  try {
    var dados = JSON.parse(e.postData.contents || '{}');
    var segredoEsperado = PropertiesService.getScriptProperties().getProperty('SYNC_SECRET');
    if (!segredoEsperado || dados.segredo !== segredoEsperado) return respostaJson({ ok: false, erro: 'Chave de sincronização inválida' });

    if (dados.acao === 'garantirPastaCliente') {
      var resultadoPasta = garantirPastaCliente(dados.nomeCliente, dados.clienteId);
      return respostaJson({
        ok: true,
        pastaId: resultadoPasta.pasta.getId(),
        pastaUrl: resultadoPasta.pasta.getUrl(),
        nome: resultadoPasta.pasta.getName(),
        estrutura: resultadoPasta.estrutura
      });
    }

    if (dados.acao === 'enviarDocumento') {
      var resultado = salvarDocumentoRotina(dados);
      return respostaJson({
        ok: true,
        arquivoId: resultado.arquivo.getId(),
        arquivoUrl: resultado.arquivo.getUrl(),
        nome: resultado.arquivo.getName(),
        originalId: resultado.original.getId(),
        originalUrl: resultado.original.getUrl(),
        conversaoStatus: resultado.conversaoStatus,
        estrutura: resultado.estrutura
      });
    }

    if (dados.acao === 'monitorarPastas') {
      monitorarNovasPastasClientes();
      return respostaJson({ ok: true });
    }

    return respostaJson({ ok: false, erro: 'Ação não reconhecida' });
  } catch (erro) {
    return respostaJson({ ok: false, erro: String(erro && erro.message ? erro.message : erro) });
  }
}
