# CRM — Iara Vieira Felício Advocacia

Sistema de gestão para o escritório: Dashboard, Quadro Kanban, Processos, Calendário, Clientes, Documentos e Relatórios.

## 1. Como rodar

Requisito: [Node.js](https://nodejs.org) instalado (versão 18 ou superior).

```bash
cd crm-escritorio
npm install
npm start
```

Acesse em: **http://localhost:3000**

Os dados ficam salvos no arquivo `data.json` (nunca apague esse arquivo sem backup) e os documentos enviados na pasta `public/uploads/`.

## 2. Como a equipe (2 a 5 pessoas) acessa

Hoje o sistema roda em **um único computador** (o "servidor"). Duas formas de todos acessarem:

### Opção A — Rede do escritório (mais simples, grátis)
1. Rode `npm start` no computador que ficará ligado durante o expediente.
2. Descubra o IP local desse computador (Windows: `ipconfig`; Mac: `ifconfig`).
3. As demais pessoas, conectadas no mesmo Wi-Fi, acessam `http://IP-DO-SERVIDOR:3000`.
4. Limitação: só funciona dentro do escritório, e o computador-servidor precisa ficar ligado.

### Opção B — Nuvem (acesso de qualquer lugar)
Hospedar em um serviço como [Railway](https://railway.app) ou [Render](https://render.com) (ambos têm planos gratuitos/baratos para esse tamanho de sistema):
1. Criar conta no serviço escolhido.
2. Conectar este projeto (pode subir para um repositório privado no GitHub e importar de lá).
3. O serviço fornece uma URL pública (ex: `crm-iara.up.railway.app`) que a equipe acessa de qualquer computador ou celular.

Posso te ajudar a fazer esse deploy quando você quiser — é um processo de uns 15-20 minutos.

## 3. Importante — segurança e confidencialidade

**O sistema ainda não tem login/senha.** Hoje, qualquer pessoa com acesso ao link (rede local ou nuvem) vê e edita todos os dados de clientes e processos.

Isso é adequado para uso interno na rede do escritório (Opção A). **Antes de colocar na internet (Opção B), recomendo fortemente adicionarmos autenticação** (login individual por pessoa da equipe), para proteger o sigilo profissional dos dados dos clientes. Posso implementar isso a seguir — é rápido de adicionar.

## 4. Backup dos dados

Os dados inteiros do escritório estão em dois lugares:
- `data.json` — clientes, processos, eventos e metadados de documentos.
- `public/uploads/` — os arquivos de documentos enviados.

Recomendo copiar essas duas coisas periodicamente para um local seguro (nuvem, HD externo).

## 5. Evoluindo o sistema

Ideias de próximos passos, conforme a necessidade crescer:
- **Login por usuário** (essencial antes de qualquer acesso externo à rede do escritório).
- Migrar de `data.json` para um banco de dados real (Postgres) se o volume de processos crescer muito ou várias pessoas editarem ao mesmo tempo com frequência.
- Notificações automáticas de prazos (e-mail/WhatsApp).
- Integração com processos judiciais eletrônicos (consulta automática de andamentos).

## 6. Estrutura do projeto

```
crm-escritorio/
  server.js       → servidor e rotas da API
  db.js           → camada de dados (lê/escreve data.json)
  data.json       → banco de dados (criado automaticamente)
  package.json
  public/
    index.html    → estrutura da página
    style.css     → estilo visual (cores e tipografia do escritório)
    app.js        → toda a lógica de tela (dashboard, kanban, formulários etc.)
    uploads/      → arquivos de documentos enviados
```
