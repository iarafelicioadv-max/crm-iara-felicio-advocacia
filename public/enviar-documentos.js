const token = window.location.pathname.split('/').filter(Boolean).pop();
const conteudo = document.getElementById('conteudo');

async function iniciar() {
  let dados;
  try {
    const res = await fetch('/api/publico/rotina/' + token);
    if (!res.ok) throw new Error();
    dados = await res.json();
  } catch (e) {
    conteudo.innerHTML = '<div class="envio-intro">Este link não é válido ou expirou. Entre em contato com o escritório para receber um novo link.</div>';
    return;
  }
  renderFormulario(dados);
}

function agruparPorTemplate(checklist) {
  const grupos = [];
  let atual = null;
  checklist.forEach((item) => {
    if (!atual || atual.templateId !== item.templateId) {
      atual = { templateId: item.templateId, templateTitulo: item.templateTitulo, itens: [] };
      grupos.push(atual);
    }
    atual.itens.push(item);
  });
  return grupos;
}

function renderFormulario(dados) {
  const primeiroNome = dados.clienteNome ? dados.clienteNome.split(' ')[0] : '';
  const orientacoes = dados.orientacoes || [];
  const grupos = agruparPorTemplate(dados.checklist || []);
  conteudo.innerHTML = `
    <div class="envio-intro">
      Olá${primeiroNome ? ', ' + primeiroNome : ''}! Envie abaixo os documentos que você já tiver disponíveis${dados.processoNome ? ' para o processo <strong>' + dados.processoNome + '</strong>' : ''}.
      Não é obrigatório enviar tudo de uma vez — você pode voltar a este mesmo link depois para enviar o restante.
    </div>
    ${orientacoes.map((o) => `
      <div class="orientacao-relato-box">
        <h3>Como contar seu caso — ${o.titulo}</h3>
        <p>${o.texto.replace(/\n/g, '</p><p>')}</p>
      </div>
    `).join('')}
    <form id="form-envio">
      ${grupos.map((g) => `
        <h3 class="checklist-template-titulo">${g.templateTitulo}</h3>
        ${g.itens.map((item) => `
          <div class="checklist-item ${item.enviado ? 'enviado' : ''}">
            <div class="checklist-item-topo">
              <strong>${item.rotulo}</strong>
              <span class="checklist-badge ${item.enviado ? 'ok' : 'pendente'}">${item.enviado ? 'Recebido' : 'Pendente'}</span>
            </div>
            ${item.enviado ? `<small>Já recebemos: ${item.nomeOriginal}. Se quiser enviar uma versão atualizada, escolha um novo arquivo abaixo.</small>` : ''}
            <input type="file" name="${item.codigo}" />
          </div>
        `).join('')}
      `).join('')}
      <div class="envio-footer">
        <button type="submit" class="btn-primary" id="btn-enviar">Enviar documentos selecionados</button>
      </div>
    </form>
  `;

  document.getElementById('form-envio').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData();
    let algumArquivo = false;
    form.querySelectorAll('input[type=file]').forEach((input) => {
      if (input.files[0]) {
        fd.append(input.name, input.files[0]);
        algumArquivo = true;
      }
    });
    if (!algumArquivo) {
      alert('Selecione ao menos um arquivo antes de enviar.');
      return;
    }
    const btn = document.getElementById('btn-enviar');
    btn.disabled = true;
    btn.textContent = 'Enviando...';
    try {
      const res = await fetch('/api/publico/rotina/' + token + '/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error();
      const resultado = await res.json();
      conteudo.innerHTML = `<div class="envio-sucesso"><h2>Documentos enviados!</h2><p>Recebemos ${resultado.salvos} arquivo(s). Nossa equipe vai revisar em breve. Obrigada!</p></div>`;
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Enviar documentos selecionados';
      alert('Não foi possível enviar agora. Tente novamente em instantes.');
    }
  });
}

iniciar();
