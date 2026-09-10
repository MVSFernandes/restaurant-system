# Restaurant System — Sistema de Gestão para Restaurantes

Sistema web para gestão completa de restaurantes: frente de caixa (PDV), atendimento por mesas, delivery, cardápio digital público, controle de estoque, financeiro, fiado e emissão de nota fiscal eletrônica.

Projeto desenvolvido como Trabalho de Conclusão de Curso — Tecnologia em Desenvolvimento de Sistemas, Centro Universitário Católico Salesiano Auxilium (Campus Araçatuba/SP).

---

## Sumário

- [Funcionalidades](#funcionalidades)
- [Tecnologias](#tecnologias)
- [Arquitetura](#arquitetura)
- [Instalação](#instalação)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Banco de dados](#banco-de-dados)
- [Fluxo de desenvolvimento](#fluxo-de-desenvolvimento)

---

## Funcionalidades

### Operação
- **PDV**: lançamento de pedidos por unidade, por peso e self-service, com preço manual controlado por perfil de usuário
- **Mesas**: controle de status (livre, ocupada, reservada, limpeza) e lançamento por garçom
- **Delivery e retirada**: cadastro de endereço, taxas diferenciadas por zona (urbana/rural)
- **Cardápio digital público**: acesso sem login para o cliente final montar e enviar pedidos
- **Cardápio de marmitas**: itens configuráveis por dia da semana, agrupados por categoria

### Financeiro
- **Caixa**: abertura e fechamento de sessão, sangrias, com bloqueio de fechamento enquanto houver pedidos pendentes de pagamento (validação em serviço e por *trigger* no banco)
- **Fiado**: limite de crédito por cliente, lançamentos vinculados a pedidos, baixas parciais e extrato com itens consumidos
- **Estoque**: insumos, quantidade mínima, vínculo com produtos e comparação de preços entre fornecedores
- **Contas a pagar**: controle de vencimentos por fornecedor

### Fiscal
- **Emissão de NF-e** (modelo 55) via API da Focus NFe, com ambientes de homologação e produção
- Configuração dos dados fiscais do emitente e padrões de NCM, CFOP, origem e código tributário
- Acompanhamento do status da nota e acesso à DANFE e ao XML

### Administração
- Controle de acesso por perfil (administrador, caixa, garçom, financeiro)
- Dashboard com indicadores e pedidos recentes em tempo real
- Registro de auditoria das operações

---

## Tecnologias

**Backend**
- Node.js + Express + TypeScript
- Supabase (PostgreSQL) via `@supabase/supabase-js`
- Autenticação com JWT (access e refresh token) e bcrypt
- Winston para logs, express-rate-limit para proteção de rotas
- jsPDF para geração de documentos

**Frontend**
- React 19 + TypeScript + Vite
- TailwindCSS
- React Router, React Hook Form + Zod, Zustand
- Axios, Lucide React

**Infraestrutura e integrações**
- Supabase (banco, Row Level Security e Realtime)
- Focus NFe (emissão de documentos fiscais)

---

## Arquitetura

O backend segue uma separação em camadas:

```
routes → controllers → services → repositories → banco
```

- **Routes**: definição dos endpoints e middlewares de autenticação/autorização
- **Controllers**: validação de entrada e formatação da resposta HTTP
- **Services**: regras de negócio (validação de limite de crédito, bloqueio de fechamento de caixa, cálculo de totais)
- **Repositories**: acesso ao banco, isolando as consultas do restante da aplicação
- **Mappers**: conversão entre o formato do banco (snake_case) e o domínio da aplicação (camelCase)

Regras críticas são aplicadas em duas camadas — aplicação e banco de dados. O bloqueio de fechamento de caixa com pedidos pendentes, por exemplo, existe no serviço e também como *trigger* no PostgreSQL, garantindo a integridade mesmo em acessos diretos ao banco.

---

## Instalação

Pré-requisitos: Node.js 18+ e um projeto no Supabase.

```bash
git clone https://github.com/MVSFernandes/restaurant-system.git
cd restaurant-system
```

**Backend**

```bash
cd backend
npm install
# crie o arquivo .env (ver seção abaixo)
npm run dev
```

O servidor sobe na porta definida em `PORT` (padrão: 3001).

**Frontend**

```bash
cd frontend
npm install
# crie os arquivos .env.development e .env.production
npm run dev
```

A aplicação fica disponível em `http://localhost:5173`.

---

## Variáveis de ambiente

**`backend/.env`**

```
PORT=3001
FRONTEND_URL=http://localhost:5173

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

JWT_SECRET=
JWT_EXPIRES_IN=
JWT_REFRESH_SECRET=
JWT_REFRESH_EXPIRES_IN=

FOCUS_NFE_TOKEN=
FOCUS_NFE_ENVIRONMENT=homologation
```

**`frontend/.env.development`**

```
VITE_API_URL=http://localhost:3001/api
```

> Os arquivos `.env` não são versionados. A `SUPABASE_SERVICE_ROLE_KEY` e o token da Focus NFe são credenciais sensíveis e não devem ser expostos no frontend.

---

### Supabase Realtime

Consulte `frontend/.env.example` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no ambiente local do frontend. Use a URL do mesmo projeto do backend e a chave pública **anon**. Reinicie o Vite após configurar; para produção, configure essas variáveis antes do build. O backend reutiliza `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, sem novas variáveis.

O cardápio registra uma presença anônima por aba em `menu-viewers`; o dashboard apenas observa e conta essas presenças. O backend envia `stock_updated` e `stock_low` por HTTP Broadcast em `stock-events`. Os avisos levam somente IDs de insumos; quantidades, nomes e alertas são buscados pela API autenticada. O frontend não consulta tabelas pelo Supabase.

Os canais são públicos e exigem **Allow public access to channels** habilitado no Realtime. Não precisam de políticas adicionais em `realtime.messages`. Qualquer portador da anon key pode ouvir/enviar mensagens nesses canais: os eventos são apenas avisos para refazer a consulta autenticada, e a presença é um indicador aproximado. O RLS existente no schema `public` continua sem políticas e sem acesso da anon key aos dados.

Sem configuração ou conexão, o cardápio e as operações de estoque continuam disponíveis; o contador fica em zero. Ao reconectar, as presenças são sincronizadas e o estoque é consultado novamente. O botão **Atualizar** permite recarregar o estoque manualmente.

Referências: [Presence](https://supabase.com/docs/guides/realtime/presence), [Broadcast](https://supabase.com/docs/guides/realtime/broadcast) e [autorização de canais](https://supabase.com/docs/guides/realtime/authorization).

---

## Banco de dados

O esquema conta com 22 tabelas no PostgreSQL, cobrindo usuários, produtos, pedidos, pagamentos, caixa, estoque, fornecedores, clientes, crédito e documentos fiscais.

Rotinas do banco (funções e *triggers*) são versionadas em `backend/supabase/migrations/`, entre elas:

- `block_cash_close_pending_orders` — impede o fechamento de sessão de caixa com pedidos pendentes
- `pay_order_with_credit` — registra pagamento em fiado de forma transacional, validando o limite de crédito do cliente

O *Row Level Security* está habilitado em todas as tabelas do schema `public`. O backend acessa o banco com a *service role key*; a chave anônima não possui acesso a dados.

---

## Fluxo de desenvolvimento

- Cada tarefa é desenvolvida em uma *branch* própria (`feat/`, `fix/`, `chore/`)
- Mensagens de commit seguem o padrão *Conventional Commits*, em inglês
- A integração à `main` ocorre exclusivamente via *Pull Request*, após validação manual dos critérios de aceitação
- Alterações estruturais no banco são versionadas como *migrations* no repositório

---

## Autor

**Marcos Vinicius dos Santos Fernandes**
Tecnologia em Desenvolvimento de Sistemas — UniSalesiano Araçatuba