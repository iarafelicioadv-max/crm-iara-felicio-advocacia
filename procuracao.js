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
    { tipo: 'paragrafo', texto: 'OUTORGADOS: IARA VASCONCELOS VIEIRA FELÍCIO, brasileira, casada, advogada inscrita na OAB/MG sob o nº 247.061, com escritório localizado na Rua João Pinheiro, 71, Centro, Caratinga/MG, CEP 35.300-067, e VICTOR AUGUSTO VIEIRA SOYER, brasileiro, solteiro, advogado inscrito na OAB/MG sob o nº 221.162, com escritório localizado na Rua Emídio Beruto, 74, 2º andar, sala 3, Cinquentenário, Belo Horizonte/MG, CEP 30.570-050.' },
    { tipo: 'paragrafo', texto: 'OBJETO: Representar a Outorgante, promovendo a defesa dos seus direitos e interesses, podendo, para tanto, propor quaisquer ações, medidas incidentais e acompanhar processos administrativos e/ou judiciais em qualquer Juízo, Instância, Tribunal ou Repartição Pública.' },
    { tipo: 'paragrafo', texto: 'PODERES: Por este instrumento particular de procuração, constituo meus bastantes procuradores os outorgados, concedendo-lhes os poderes inerentes à cláusula ad judicia et extra, para o foro em geral, podendo promover quaisquer medidas judiciais ou administrativas, assinar termos, oferecer defesa direta ou indireta, interpor recursos, ajuizar ações e conduzir os respectivos processos, solicitar, providenciar e ter acesso a documentos de qualquer natureza. O presente instrumento de mandato é oneroso e contratual, podendo os procuradores substabelecer a outrem, com ou sem reserva de poderes, dando tudo por bom e valioso, a fim de praticar os demais atos necessários ao fiel desempenho deste mandato.' },
    { tipo: 'paragrafo', texto: 'PODERES ESPECÍFICOS: A presente procuração outorga aos Advogados acima descritos poderes especiais para receber citação, confessar, reconhecer a procedência do pedido, transigir, desistir, renunciar ao direito sobre o qual se funda a ação, firmar compromissos ou acordos, receber valores, dar e receber quitação, levantar e receber RPV e ALVARÁS, requerer a gratuidade da justiça e assinar declaração de hipossuficiência econômica, em conformidade com o art. 105 da Lei nº 13.105/2015.' },
    { tipo: 'data', texto: `${dados.localAssinatura}, ${dataExtenso(dados.dataAssinatura)}.` },
    { tipo: 'assinatura', texto: dados.nome },
    { tipo: 'assinaturaCpf', texto: `CPF ${dados.cpf}` },
  ];
}

function limparPdfTexto(valor) {
  return texto(valor)
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

function larguraAproximada(valor, tamanho) {
  return [...limparPdfTexto(valor)].reduce((total, caractere) => {
    if ('MWÁÉÍÓÚÃÕÇ'.includes(caractere)) return total + tamanho * 0.78;
    if ('ilI1.,:;!'.includes(caractere)) return total + tamanho * 0.28;
    if (caractere === ' ') return total + tamanho * 0.28;
    return total + tamanho * 0.52;
  }, 0);
}

function quebrarLinhas(valor, largura, tamanho) {
  const palavras = limparPdfTexto(valor).split(' ');
  const linhas = [];
  let atual = '';
  for (const palavra of palavras) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (atual && larguraAproximada(tentativa, tamanho) > largura) {
      linhas.push(atual);
      atual = palavra;
    } else atual = tentativa;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

function escaparPdf(valor) {
  return limparPdfTexto(valor).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function objetosPdf(paginas) {
  const objetos = [];
  objetos[1] = Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'ascii');
  const idsPaginas = paginas.map((_, indice) => 5 + indice * 2);
  objetos[2] = Buffer.from(`<< /Type /Pages /Kids [${idsPaginas.map((id) => `${id} 0 R`).join(' ')}] /Count ${idsPaginas.length} >>`, 'ascii');
  objetos[3] = Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', 'ascii');
  objetos[4] = Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>', 'ascii');
  paginas.forEach((comandos, indice) => {
    const paginaId = idsPaginas[indice];
    const conteudoId = paginaId + 1;
    objetos[paginaId] = Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${conteudoId} 0 R >>`, 'ascii');
    const stream = Buffer.from(comandos.join('\n'), 'latin1');
    objetos[conteudoId] = Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'ascii'), stream, Buffer.from('\nendstream', 'ascii')]);
  });
  return objetos;
}

function montarBufferPdf(objetos) {
  const partes = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary')];
  const offsets = [0];
  let posicao = partes[0].length;
  for (let id = 1; id < objetos.length; id += 1) {
    const cabecalho = Buffer.from(`${id} 0 obj\n`, 'ascii');
    const rodape = Buffer.from('\nendobj\n', 'ascii');
    offsets[id] = posicao;
    partes.push(cabecalho, objetos[id], rodape);
    posicao += cabecalho.length + objetos[id].length + rodape.length;
  }
  const xref = posicao;
  let tabela = `xref\n0 ${objetos.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objetos.length; id += 1) tabela += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  tabela += `trailer\n<< /Size ${objetos.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  partes.push(Buffer.from(tabela, 'ascii'));
  return Buffer.concat(partes);
}

function gerarPdfProcuracao(dados) {
  const larguraUtil = 467;
  const paginas = [[]];
  let pagina = 0;
  let y = 782;
  const novaPagina = () => { pagina += 1; paginas[pagina] = []; y = 782; };
  const escrever = (linha, { fonte = 'F1', tamanho = 10.5, x = 64, entrelinha = 14 } = {}) => {
    if (y < 65) novaPagina();
    paginas[pagina].push(`BT /${fonte} ${tamanho} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escaparPdf(linha)}) Tj ET`);
    y -= entrelinha;
  };

  for (const bloco of blocosProcuracao(dados)) {
    if (bloco.tipo === 'titulo') {
      const tamanho = 16;
      const largura = larguraAproximada(bloco.texto, tamanho);
      escrever(bloco.texto, { fonte: 'F2', tamanho, x: (595.28 - largura) / 2, entrelinha: 30 });
      continue;
    }
    if (bloco.tipo === 'data') {
      y -= 10;
      escrever(bloco.texto, { x: Math.max(64, 531 - larguraAproximada(bloco.texto, 10.5)), entrelinha: 36 });
      continue;
    }
    if (bloco.tipo === 'assinatura') {
      escrever('____________________________________________', { x: 160, entrelinha: 18 });
      const largura = larguraAproximada(bloco.texto, 10.5);
      escrever(bloco.texto, { fonte: 'F2', x: Math.max(64, (595.28 - largura) / 2), entrelinha: 16 });
      continue;
    }
    if (bloco.tipo === 'assinaturaCpf') {
      const largura = larguraAproximada(bloco.texto, 10.5);
      escrever(bloco.texto, { x: Math.max(64, (595.28 - largura) / 2), entrelinha: 14 });
      continue;
    }
    const linhas = quebrarLinhas(bloco.texto, larguraUtil, 10.5);
    linhas.forEach((linha) => escrever(linha));
    y -= bloco.texto.startsWith('Constituo') ? 4 : 9;
  }
  return montarBufferPdf(objetosPdf(paginas));
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
