# CRM — Iara Vieira Felício Advocacia

Sistema de gestão para o escritório: Dashboard, Quadro Kanban, Processos, Calendário, Clientes, Documentos, Relatórios e Usuários — agora com login por pessoa.

**Endereço em produção:** https://crm-iara-felicio-advocacia.onrender.com

## Versão operacional V3

- Controladoria por exceção: prazos, publicações, cadastros, documentos e financeiro.
- Tarefas com responsável, prazo fatal/interno, evidência de conclusão e revisão.
- Central de publicações para TJMG, TRT-3, TRF-6 e DJEN/CNJ, com conciliação pelo número CNJ.
- Financeiro com contratos, recebimentos, vencidos e projeções de 30, 60 e 90 dias.
- Funil de leads com atalho para WhatsApp.
- Rotina documental preservada, incluindo os 42 checklists por tipo de caso e link de envio ao cliente.
- Dados e documentos persistidos em PostgreSQL/Neon.

A consulta automática ao DJEN e a entrada automática de leads pelo WhatsApp dependem de integrações oficiais externas. O CRM já contém os fluxos de conciliação e tratamento, sem simular conexões não configuradas.

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
