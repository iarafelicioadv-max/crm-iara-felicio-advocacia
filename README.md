# CRM — Iara Vieira Felício Advocacia

Sistema de gestão para o escritório: Dashboard, Quadro Kanban, Processos, Calendário, Clientes, Documentos, Relatórios e Usuários — agora com login por pessoa.

**Endereço em produção:** https://crm-iara-felicio-advocacia.onrender.com

## Versão operacional V3

- Controladoria por exceção: prazos, publicações, cadastros, documentos e financeiro.
- Tarefas com responsável, prazo fatal/interno, evidência de conclusão e revisão.
- Central de publicações para TJMG, TRT-3, TRF-6 e DJEN/CNJ, com conciliação pelo número CNJ.
- Financeiro com condição parcelada da cliente separada do repasse líquido da operadora, tarifas do cartão, honorários de êxito condicionais e projeções reais de caixa.
- Funil de leads com receptor oficial da Meta, criação automática sem duplicidade, contador de não lidas, histórico e atalho para responder no WhatsApp.
- Rotina documental preservada, incluindo os 42 checklists por tipo de caso e link de envio ao cliente.
- Dados e documentos persistidos em PostgreSQL/Neon.

A consulta automática ao DJEN depende de integração oficial externa. O receptor do WhatsApp já está implementado no CRM e passa a receber mensagens assim que a Meta e a Render forem vinculadas conforme a seção abaixo.

## Integração com WhatsApp Business Platform

O endpoint de webhook é `https://crm-iara-felicio-advocacia.onrender.com/webhooks/whatsapp`.

Variáveis secretas exigidas na Render:

- `WHATSAPP_VERIFY_TOKEN`: frase aleatória criada para confirmar o webhook; deve ser idêntica no painel Meta.
- `WHATSAPP_APP_SECRET`: segredo do aplicativo em Meta for Developers; valida a assinatura de cada mensagem recebida.
- `WHATSAPP_PHONE_NUMBER_ID`: identificador do novo número fornecido pela Meta; habilita o envio pelo CRM.
- `WHATSAPP_ACCESS_TOKEN`: token permanente de usuário do sistema com permissão para o WhatsApp; nunca use o token temporário em produção.
- `WHATSAPP_GRAPH_API_VERSION`: versão da Graph API (opcional; padrão atual do projeto: `v26.0`).

No painel Meta for Developers, configure a URL acima, informe o mesmo token de verificação e assine o campo `messages`. Nunca grave os valores secretos no GitHub.

Sem `WHATSAPP_PHONE_NUMBER_ID` e `WHATSAPP_ACCESS_TOKEN`, o CRM mantém o recebimento ativo e deixa o compositor de respostas bloqueado. Depois que as duas variáveis forem cadastradas, respostas de texto ficam disponíveis no histórico do lead e os respectivos status de entrega são atualizados pelos webhooks da Meta.

## Integração com a ZapSign e contratos assinados

O financeiro permite vincular cada contrato ao arquivo permanente no Google Drive e ao identificador do documento na ZapSign. A cópia do Drive é a fonte documental permanente; URLs de arquivos assinados recebidas por webhook não são armazenadas, pois são temporárias.

O endpoint de webhook é `https://crm-iara-felicio-advocacia.onrender.com/api/integracoes/zapsign/webhook`.

Variáveis secretas exigidas na Render:

- `ZAPSIGN_API_TOKEN`: token da API obtido no painel da ZapSign; permite ao CRM consultar o status de um documento sob demanda.
- `ZAPSIGN_WEBHOOK_SECRET`: chave aleatória longa, usada para autenticar as notificações recebidas.

No painel da ZapSign, cadastre o endpoint acima para os eventos de criação, assinatura, recusa, exclusão e expiração de documento. Adicione o cabeçalho personalizado `x-zapsign-secret` com o mesmo valor de `ZAPSIGN_WEBHOOK_SECRET`. O receptor é idempotente e responde HTTP 200 inclusive quando o evento não pertence a um contrato conhecido, evitando novas tentativas desnecessárias.

Nunca grave os dois segredos no GitHub. O valor bruto registra o contrato; o fluxo de caixa considera o repasse líquido após as tarifas da operadora. Honorários de êxito permanecem condicionais e só devem virar recebível depois que a base de cálculo for conhecida.

## Integração com a pasta CLIENTES do Google Drive

Ao criar uma cliente, o CRM cria ou reaproveita uma pasta com o nome dela dentro de `CLIENTES`. Arquivos enviados pelo portal documental ou anexados no cadastro são mantidos no banco do CRM e também copiados para essa pasta. Se o Google estiver indisponível, o cadastro não é perdido: o item fica como pendente e pode ser reenviado pelo botão de nuvem na lista de clientes.

A integração usa um Google Apps Script executado pela conta proprietária dos arquivos. Isso é necessário porque contas de serviço não possuem cota de armazenamento no “Meu Drive”.

1. Crie um projeto em https://script.google.com e copie o conteúdo de `integracoes/google-drive-apps-script.gs` para `Code.gs`.
2. Em “Configurações do projeto > Propriedades do script”, adicione:
   - `CLIENTES_FOLDER_ID`: ID da pasta `CLIENTES`, obtido no endereço do Drive.
   - `SYNC_SECRET`: uma chave aleatória longa, exclusiva para essa integração.
3. Implante como aplicativo da web, executando como a proprietária e permitindo acesso a qualquer pessoa que possua a URL. A chave secreta continua sendo obrigatória em cada operação.
4. Cadastre na Render:
   - `GOOGLE_DRIVE_WEBHOOK_URL`: URL `/exec` fornecida pela implantação do Apps Script.
   - `GOOGLE_DRIVE_SYNC_SECRET`: o mesmo valor de `SYNC_SECRET`. Marque como segredo.
5. Faça novo deploy e use o botão de nuvem de uma cliente existente para validar a pasta e copiar documentos pendentes.

Nunca grave a chave de sincronização no GitHub. A automação cobre documentos que passam pelo CRM. Arquivos recebidos diretamente por e-mail, WhatsApp ou navegador precisam ser enviados ao portal da cliente ou movidos para a pasta de entrada antes da organização.

## 1. Login

Cada pessoa da equipe tem seu próprio e-mail e senha. No primeiro acesso, o sistema pede para trocar a senha temporária por uma definitiva.

Como administradora, você pode cadastrar/remover pessoas da equipe pelo menu "Usuários" (só aparece para administradoras).

## 2. Como rodar localmente (opcional, para testes)

Requisito: Node.js 18+.

```bash
cd crm-escritorio
npm install
npm start
```

Acesse em http://localhost:3000 — na primeira vez, o terminal mostra o e-mail e a senha temporária da conta administradora inicial (ou defina as variáveis de ambiente `ADMIN_EMAIL` e `ADMIN_INITIAL_PASSWORD` antes de rodar).

## 3. Onde ficam os dados

- `data.json` — clientes, processos, eventos, documentos (metadados) e usuários (senhas sempre criptografadas, nunca em texto puro).
- `uploads_privados/` — arquivos de documentos enviados. Só acessíveis por quem está logado.

Recomendo backups periódicos desses dois itens.

## 4. Segurança

- Senhas são armazenadas com hash (bcrypt), nunca em texto puro.
- Todas as rotas de dados e os arquivos de documentos exigem login.
- A variável de ambiente `SESSION_SECRET` (configurada na Render) protege as sessões de login — não a compartilhe.
- Ao remover uma pessoa da equipe pelo menu Usuários, o acesso dela é cortado imediatamente.

## 5. Evoluindo o sistema

- Migrar de `data.json` para um banco de dados real (Postgres) se o volume crescer muito.
- Notificações automáticas de prazos (e-mail/WhatsApp).
- Integração com processos judiciais eletrônicos.
- Log de auditoria (quem alterou o quê e quando).

## 6. Estrutura do projeto

```
crm-escritorio/
  server.js       → servidor, rotas da API e autenticação
  db.js           → camada de dados (lê/escreve data.json)
  data.json       → banco de dados (criado automaticamente)
  package.json
  public/
    login.html    → tela de login
    index.html    → estrutura da aplicação (após login)
    style.css     → estilo visual do escritório
    app.js        → lógica de tela (dashboard, kanban, usuários, senha etc.)
  uploads_privados/ → arquivos de documentos (protegidos, fora da pasta public)
```
