'use strict';

function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function centavos(valor) {
  return Math.round(numero(valor) * 100);
}

function adicionarMes(dataISO, meses) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dataISO || ''))) return null;
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  const alvo = new Date(Date.UTC(ano, mes - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(dia, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

function dividirValor(totalInformado, quantidadeInformada, valorUnitarioInformado, primeiraData) {
  const quantidade = Math.max(1, Math.trunc(numero(quantidadeInformada) || 1));
  const total = centavos(totalInformado);
  const valorInformado = centavos(valorUnitarioInformado);
  let restante = total;
  return Array.from({ length: quantidade }, (_, indice) => {
    const faltam = quantidade - indice;
    const sugerido = valorInformado || Math.round(restante / faltam);
    const valor = indice === quantidade - 1 ? restante : Math.min(restante, sugerido);
    restante -= valor;
    return {
      numero: indice + 1,
      valor: valor / 100,
      vencimento: primeiraData ? adicionarMes(primeiraData, indice) : null,
    };
  });
}

function normalizarContrato(contrato) {
  const normalizado = { ...contrato };
  normalizado.valorTotal = numero(normalizado.valorTotal);

  // O parcelamento da cliente é uma condição comercial. Ele não entra no
  // fluxo de caixa quando a operadora antecipa o valor ao escritório.
  normalizado.numeroParcelasCliente = Math.max(1, Math.trunc(numero(normalizado.numeroParcelasCliente || normalizado.numeroParcelas) || 1));
  normalizado.valorParcelaCliente = numero(normalizado.valorParcelaCliente || normalizado.valorParcela)
    || Number((normalizado.valorTotal / normalizado.numeroParcelasCliente).toFixed(2));
  normalizado.parcelasCliente = dividirValor(
    normalizado.valorTotal,
    normalizado.numeroParcelasCliente,
    normalizado.valorParcelaCliente,
    null
  ).map(({ numero: n, valor }) => ({ numero: n, valor }));

  normalizado.taxaCartaoValor = Math.max(0, numero(normalizado.taxaCartaoValor));
  normalizado.taxaCartaoPercentual = Math.max(0, numero(normalizado.taxaCartaoPercentual));
  if (!normalizado.taxaCartaoValor && normalizado.taxaCartaoPercentual) {
    normalizado.taxaCartaoValor = Number((normalizado.valorTotal * normalizado.taxaCartaoPercentual / 100).toFixed(2));
  }
  normalizado.valorLiquidoPrevisto = numero(normalizado.valorLiquidoPrevisto)
    || Number(Math.max(0, normalizado.valorTotal - normalizado.taxaCartaoValor).toFixed(2));
  if (!normalizado.taxaCartaoValor && normalizado.valorLiquidoPrevisto < normalizado.valorTotal) {
    normalizado.taxaCartaoValor = Number((normalizado.valorTotal - normalizado.valorLiquidoPrevisto).toFixed(2));
  }

  normalizado.numeroRepasses = Math.max(1, Math.trunc(numero(normalizado.numeroRepasses) || 1));
  normalizado.dataPrimeiroRepasse = normalizado.dataPrimeiroRepasse || normalizado.dataPrimeiroVencimento || normalizado.proximoVencimento || null;
  normalizado.repasses = Array.isArray(normalizado.repasses) && normalizado.repasses.length
    ? normalizado.repasses.map((p, i) => ({ numero: p.numero || i + 1, valor: numero(p.valor), vencimento: p.vencimento || null }))
    : dividirValor(normalizado.valorLiquidoPrevisto, normalizado.numeroRepasses, null, normalizado.dataPrimeiroRepasse);

  // Nomes antigos mantidos para compatibilidade com registros já existentes.
  normalizado.numeroParcelas = normalizado.numeroParcelasCliente;
  normalizado.valorParcela = normalizado.valorParcelaCliente;
  return normalizado;
}

function detalharContrato(contrato, pagamentos, hoje) {
  const normalizado = normalizarContrato(contrato);
  let credito = centavos((pagamentos || []).filter((p) => p.contratoId === normalizado.id).reduce((s, p) => s + numero(p.valor), 0));
  const recebido = credito / 100;
  const repasses = normalizado.repasses.map((repasse) => {
    const devido = centavos(repasse.valor);
    const aplicado = Math.min(devido, credito);
    credito -= aplicado;
    const aberto = Math.max(0, devido - aplicado) / 100;
    let situacao = aplicado >= devido ? 'Recebido' : (aplicado > 0 ? 'Parcial' : 'A receber');
    if (aberto > 0 && repasse.vencimento && repasse.vencimento < hoje) situacao = 'Atrasado';
    return { ...repasse, valorPago: aplicado / 100, valorAberto: aberto, situacao };
  });
  const saldo = Math.max(0, normalizado.valorLiquidoPrevisto - recebido);
  const vencido = repasses.filter((p) => p.situacao === 'Atrasado').reduce((s, p) => s + p.valorAberto, 0);
  const proximo = repasses.find((p) => p.valorAberto > 0);
  return {
    ...normalizado,
    repasses,
    repassesRecebidos: repasses.filter((p) => p.situacao === 'Recebido').length,
    recebido,
    saldo,
    valorVencido: vencido,
    vencido: vencido > 0,
    proximoVencimento: proximo ? proximo.vencimento : null,
    proximaParcelaValor: proximo ? proximo.valorAberto : 0,
  };
}

function calcularFinanceiro(db, hoje = new Date().toISOString().slice(0, 10)) {
  const contratos = db.contratos || [];
  const pagamentos = db.pagamentos || [];
  const contratosDetalhados = contratos.map((c) => detalharContrato(c, pagamentos, hoje));
  const ativos = contratosDetalhados.filter((c) => c.status !== 'Cancelado');
  const repassesAtivos = ativos.flatMap((c) => c.repasses);
  const totalContratado = ativos.reduce((s, c) => s + numero(c.valorTotal), 0);
  const totalLiquidoPrevisto = ativos.reduce((s, c) => s + numero(c.valorLiquidoPrevisto), 0);
  const totalTaxasCartao = ativos.reduce((s, c) => s + numero(c.taxaCartaoValor), 0);
  const totalRecebido = pagamentos.reduce((s, p) => s + numero(p.valor), 0);
  const projetar = (dias) => {
    const limite = new Date(`${hoje}T12:00:00Z`);
    limite.setUTCDate(limite.getUTCDate() + dias);
    const limiteStr = limite.toISOString().slice(0, 10);
    return repassesAtivos
      .filter((p) => p.valorAberto > 0 && p.vencimento && p.vencimento >= hoje && p.vencimento <= limiteStr)
      .reduce((s, p) => s + p.valorAberto, 0);
  };
  return {
    totalContratado,
    totalLiquidoPrevisto,
    totalTaxasCartao,
    totalRecebido,
    totalRecebidoConciliado: pagamentos.filter((p) => p.contratoId && contratos.some((c) => c.id === p.contratoId)).reduce((s, p) => s + numero(p.valor), 0),
    aReceber: ativos.reduce((s, c) => s + c.saldo, 0),
    vencido: ativos.reduce((s, c) => s + c.valorVencido, 0),
    projecao30: projetar(30),
    projecao60: projetar(60),
    projecao90: projetar(90),
    contratos: contratosDetalhados,
    pagamentosSemContrato: pagamentos.filter((p) => !p.contratoId),
  };
}

module.exports = { adicionarMes, normalizarContrato, detalharContrato, calcularFinanceiro };
