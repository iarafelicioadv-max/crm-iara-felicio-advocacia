'use strict';

const TITULO = 'PROCURAÇÃO';

function texto(valor) {
  return String(valor || '').replace(/\s+/g, ' ').trim();
}

function somenteDigitos(valor) {
  return texto(valor).replace(/\D/g, '');
}

function formatarCpf(valor) {
  const digitos = somenteDigitos(valor);
  if (digitos.length !== 11) return texto(valor);
  return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatarCep(valor) {
  const digitos = somenteDigitos(valor);
  if (digitos.length !== 8) return texto(valor);
  return digitos.replace(/(\d{5})(\d{3})/, '$1-$2');
}

function dataExtenso(valor) {
  const data = valor ? new Date(`${valor}T12:00:00`) : new Date();
  if (Number.isNaN(data.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo',
  }).format(data);
}

function montarEndereco(dados, cliente = {}) {
  if (texto(dados.enderecoCompleto || cliente.endereco)) return texto(dados.enderecoCompleto || cliente.endereco);
  const partes = [];
  if (texto(dados.logradouro)) partes.push(texto(dados.logradouro));
  if (texto(dados.numeroEndereco)) partes.push(`nº ${texto(dados.numeroEndereco)}`);
  if (texto(dados.complemento)) partes.push(texto(dados.complemento));
  if (texto(dados.bairro)) partes.push(`Bairro ${texto(dados.bairro)}`);
  if (texto(dados.cep)) partes.push(`CEP: ${formatarCep(dados.cep)}`);
  if (texto(dados.cidade)) partes.push(texto(dados.cidade));
  if (texto(dados.uf)) partes.push(texto(dados.uf).toUpperCase());
  return partes.join(', ');
}

function normalizarDadosProcuracao(dados = {}, cliente = {}) {
  const cpf = formatarCpf(dados.cpf || cliente.documento);
  const cidade = texto(dados.cidade || cliente.cidade || 'Caratinga');
  const uf = texto(dados.uf || cliente.uf || 'MG').toUpperCase();
  return {
    nome: texto(dados.nome || cliente.nome).toLocaleUpperCase('pt-BR'),
    nacionalidade: texto(dados.nacionalidade || cliente.nacionalidade || 'brasileira'),
    estadoCivil: texto(dados.estadoCivil || cliente.estadoCivil),
    profissao: texto(dados.profissao || cliente.profissao),
    rg: texto(dados.rg || cliente.rg),
    orgaoEmissor: texto(dados.orgaoEmissor || cliente.orgaoEmissor || 'Instituto de Identificação PC/MG'),
    cpf,
    enderecoCompleto: montarEndereco(dados, cliente),
    logradouro: texto(dados.logradouro || cliente.logradouro),
    numeroEndereco: texto(dados.numeroEndereco || cliente.numeroEndereco),
    complemento: texto(dados.complemento || cliente.complemento),
    bairro: texto(dados.bairro || cliente.bairro),
    cep: formatarCep(dados.cep || cliente.cep),
    cidade,
    uf,
    localAssinatura: texto(dados.localAssinatura || cidade || 'Caratinga'),
    dataAssinatura: texto(dados.dataAssinatura) || new Date().toISOString().slice(0, 10),
    email: texto(dados.email || cliente.email),
    telefone: texto(dados.telefone || cliente.telefone),
    outorgadoAdicional: texto(dados.outorgadoAdicional),
  };
}

function validarDadosProcuracao(dados) {
  const obrigatorios = {
    nome: 'nome completo', nacionalidade: 'nacionalidade', estadoCivil: 'estado civil',
    profissao: 'profissão', rg: 'RG', orgaoEmissor: 'órgão emissor',
    enderecoCompleto: 'endereço completo', localAssinatura: 'local da assinatura',
    dataAssinatura: 'data da assinatura',
  };
  const faltantes = Object.entries(obrigatorios).filter(([campo]) => !texto(dados[campo])).map(([, rotulo]) => rotulo);
  if (somenteDigitos(dados.cpf).length !== 11) faltantes.push('CPF válido com 11 dígitos');
  return [...new Set(faltantes)];
}

function blocosProcuracao(dados) {
  return [
    { tipo: 'titulo', texto: TITULO },
    { tipo: 'paragrafo', texto: 'Pelo presente instrumento particular de mandato por mim abaixo assinado:' },
    { tipo: 'paragrafo', texto: `OUTORGANTE: ${dados.nome}, ${dados.nacionalidade}, ${dados.estadoCivil}, ${dados.profissao}, portadora da Carteira de Identidade nº ${dados.rg}, emitida pelo ${dados.orgaoEmissor}, CPF nº ${dados.cpf}, residente e domiciliada em ${dados.enderecoCompleto}.` },
    { tipo: 'paragrafo', texto: 'Constituo e nomeio os procuradores:' },
    { tipo: 'paragrafo', texto: 'OUTORGADOS: IARA VASCONCELOS VIEIRA FELÍCIO, brasileira, casada, advogada inscrita na OAB/MG sob o nº 247.061, com escritório localizado na Rua João Pinheiro, 71, Centro, Caratinga/MG, CEP 35.300-067' + (dados.outorgadoAdicional ? `, e ${dados.outorgadoAdicional}.` : '.') },
    { tipo: 'paragrafo', texto: 'OBJETO: Representar a Outorgante, promovendo a defesa dos seus direitos e interesses, podendo, para tanto, propor quaisquer ações, medidas incidentais e acompanhar processos administrativos e/ou judiciais em qualquer Juízo, Instância, Tribunal ou Repartição Pública.' },
    { tipo: 'paragrafo', texto: 'PODERES: Por este instrumento particular de procuração, constituo meus bastantes procuradores os outorgados, concedendo-lhes os poderes inerentes à cláusula ad judicia et extra, para o foro em geral, podendo promover quaisquer medidas judiciais ou administrativas, assinar termos, oferecer defesa direta ou indireta, interpor recursos, ajuizar ações e conduzir os respectivos processos, solicitar, providenciar e ter acesso a documentos de qualquer natureza. O presente instrumento de mandato é oneroso e contratual, podendo os procuradores substabelecer a outrem, com ou sem reserva de poderes, dando tudo por bom e valioso, a fim de praticar os demais atos necessários ao fiel desempenho deste mandato.' },
    { tipo: 'paragrafo', texto: 'PODERES ESPECÍFICOS: A presente procuração outorga aos Advogados acima descritos poderes especiais para receber citação, confessar, reconhecer a procedência do pedido, transigir, desistir, renunciar ao direito sobre o qual se funda a ação, firmar compromissos ou acordos, receber valores, dar e receber quitação, levantar e receber RPV e ALVARÁS, requerer a gratuidade da justiça e assinar declaração de hipossuficiência econômica, em conformidade com o art. 105 da Lei nº 13.105/2015.' },
    { tipo: 'data', texto: `${dados.localAssinatura}, ${dataExtenso(dados.dataAssinatura)}.` },
    { tipo: 'assinatura', texto: dados.nome },
    { tipo: 'assinaturaCpf', texto: `CPF ${dados.cpf}` },
  ];
}


const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const COR_MARCA = rgb(83 / 255, 70 / 255, 57 / 255); // marrom da logo IVF
const COR_TEXTO_SECUNDARIO = rgb(0.4, 0.4, 0.4);
const LARGURA_PAGINA = 595.28; // A4
const ALTURA_PAGINA = 841.89;
const MARGEM = 56;
const TOPO_CONTEUDO = 706;
const ALTURA_RODAPE = 30;
const RODAPE_LIMITE = 78;
const CAMINHO_LOGO = path.join(__dirname, 'public', 'logo.png');

function quebrarLinhasComFonte(valorBruto, fonte, tamanho, larguraMaxima) {
  const valor = limparPdfTexto(valorBruto);
  const palavras = valor.split(' ');
  const linhas = [];
  let atual = '';
  for (const palavra of palavras) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (atual && fonte.widthOfTextAtSize(tentativa, tamanho) > larguraMaxima) {
      linhas.push(atual);
      atual = palavra;
    } else {
      atual = tentativa;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

function limparPdfTexto(valor) {
  return texto(valor)
    .replace(/[–—]/g, '-')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'");
}

async function gerarPdfProcuracao(dados) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Procuração - ${dados.nome}`);
  pdf.setAuthor('IVF Advocacia e Consultoria Jurídica');

  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const fonteNegrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logoBytes = fs.readFileSync(CAMINHO_LOGO);
  const logo = await pdf.embedPng(logoBytes);
  const logoAltura = 34;
  const logoLargura = (logo.width / logo.height) * logoAltura;

  const paginas = [];
  let pagina = null;
  let y = 0;

  function desenharTimbrado(novaPagina) {
    novaPagina.drawImage(logo, {
      x: MARGEM,
      y: ALTURA_PAGINA - 30 - logoAltura,
      width: logoLargura,
      height: logoAltura,
    });
    const tituloEscritorio = 'IVF ADVOCACIA E CONSULTORIA JURÍDICA';
    const tamanhoTitulo = 10;
    const larguraTitulo = fonteNegrito.widthOfTextAtSize(tituloEscritorio, tamanhoTitulo);
    novaPagina.drawText(tituloEscritorio, {
      x: LARGURA_PAGINA - MARGEM - larguraTitulo,
      y: ALTURA_PAGINA - 40,
      size: tamanhoTitulo,
      font: fonteNegrito,
      color: COR_MARCA,
    });
    const email = 'iarafelicio.adv@gmail.com';
    const tamanhoEmail = 9;
    const larguraEmail = fonte.widthOfTextAtSize(email, tamanhoEmail);
    novaPagina.drawText(email, {
      x: LARGURA_PAGINA - MARGEM - larguraEmail,
      y: ALTURA_PAGINA - 53,
      size: tamanhoEmail,
      font: fonte,
      color: COR_TEXTO_SECUNDARIO,
    });
    novaPagina.drawLine({
      start: { x: MARGEM, y: ALTURA_PAGINA - 70 },
      end: { x: LARGURA_PAGINA - MARGEM, y: ALTURA_PAGINA - 70 },
      thickness: 1,
      color: COR_MARCA,
    });
    novaPagina.drawRectangle({
      x: 0,
      y: 0,
      width: LARGURA_PAGINA,
      height: ALTURA_RODAPE,
      color: COR_MARCA,
    });
    const contato = '(33) 99931-7790  |  @iarafelicioadv';
    novaPagina.drawText(contato, {
      x: MARGEM,
      y: ALTURA_RODAPE / 2 - 3,
      size: 8.5,
      font: fonte,
      color: rgb(1, 1, 1),
    });
    const assinaturaEscritorio = 'IARA V. VIEIRA FELÍCIO — OAB/MG 247.061';
    const larguraAssinaturaEscritorio = fonteNegrito.widthOfTextAtSize(assinaturaEscritorio, 8.5);
    novaPagina.drawText(assinaturaEscritorio, {
      x: LARGURA_PAGINA - MARGEM - larguraAssinaturaEscritorio,
      y: ALTURA_RODAPE / 2 - 3,
      size: 8.5,
      font: fonteNegrito,
      color: rgb(1, 1, 1),
    });
  }

  function novaPagina() {
    pagina = pdf.addPage([LARGURA_PAGINA, ALTURA_PAGINA]);
    desenharTimbrado(pagina);
    paginas.push(pagina);
    y = TOPO_CONTEUDO;
  }

  function escrever(linhaTexto, { negrito = false, tamanho = 10.5, x = MARGEM, entrelinha = 14, cor = rgb(0, 0, 0) } = {}) {
    if (y < RODAPE_LIMITE) novaPagina();
    pagina.drawText(limparPdfTexto(linhaTexto), {
      x,
      y,
      size: tamanho,
      font: negrito ? fonteNegrito : fonte,
      color: cor,
    });
    y -= entrelinha;
  }

  novaPagina();
  const larguraUtil = LARGURA_PAGINA - MARGEM * 2;

  for (const bloco of blocosProcuracao(dados)) {
    if (bloco.tipo === 'titulo') {
      const tamanho = 15;
      const largura = fonteNegrito.widthOfTextAtSize(bloco.texto, tamanho);
      escrever(bloco.texto, { negrito: true, tamanho, x: (LARGURA_PAGINA - largura) / 2, entrelinha: 30, cor: COR_MARCA });
      continue;
    }
    if (bloco.tipo === 'data') {
      y -= 10;
      const largura = fonte.widthOfTextAtSize(bloco.texto, 10.5);
      escrever(bloco.texto, { x: Math.max(MARGEM, LARGURA_PAGINA - MARGEM - largura), entrelinha: 36 });
      continue;
    }
    if (bloco.tipo === 'assinatura') {
      escrever('____________________________________________', { x: 160, entrelinha: 18 });
      const largura = fonteNegrito.widthOfTextAtSize(bloco.texto, 10.5);
      escrever(bloco.texto, { negrito: true, x: Math.max(MARGEM, (LARGURA_PAGINA - largura) / 2), entrelinha: 16 });
      continue;
    }
    if (bloco.tipo === 'assinaturaCpf') {
      const largura = fonte.widthOfTextAtSize(bloco.texto, 10.5);
      escrever(bloco.texto, { x: Math.max(MARGEM, (LARGURA_PAGINA - largura) / 2), entrelinha: 14 });
      continue;
    }
    const linhas = quebrarLinhasComFonte(bloco.texto, fonte, 10.5, larguraUtil);
    linhas.forEach((linha) => escrever(linha));
    y -= bloco.texto.startsWith('Constituo') ? 4 : 9;
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

module.exports = {
  TITULO,
  blocosProcuracao,
  dataExtenso,
  formatarCpf,
  gerarPdfProcuracao,
  normalizarDadosProcuracao,
  validarDadosProcuracao,
};
