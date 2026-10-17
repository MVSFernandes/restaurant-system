# Dockerfile do backend do Restaurant System (Node + Express + TypeScript)
# Usei multi-stage build: compilo o TypeScript numa etapa e levo pra imagem
# final só o JavaScript compilado e as dependências de produção.

# ---------- Etapa 1: build ----------
# Alpine porque é bem menor que a imagem padrão do Node
FROM node:22-alpine AS build

# O bcrypt é um módulo nativo, então às vezes precisa compilar na instalação.
# Essas ferramentas ficam só nessa etapa, não vão pra imagem final.
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copio primeiro só os arquivos de dependência. Assim, se eu mexer só no
# código, o Docker reaproveita o cache do npm ci e o build fica bem mais rápido.
COPY package.json package-lock.json ./
RUN npm ci

# Agora sim o código e o build (tsc gera a pasta dist/)
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Tiro as dependências de desenvolvimento (typescript, ts-node, CLI do
# supabase...). Fica só o que o servidor precisa pra rodar.
RUN npm prune --omit=dev && npm cache clean --force

# ---------- Etapa 2: imagem final ----------
FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3001

WORKDIR /app

# Só o necessário: package.json, node_modules de produção e o dist compilado.
# O código TypeScript, os testes e as ferramentas de build ficam pra trás.
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist

# Não rodo como root. A imagem do Node já vem com o usuário "node".
USER node

EXPOSE 3001

# O app já tem a rota /health, então uso ela pro Docker saber se o
# container está saudável de verdade, e não só "rodando".
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/health || exit 1

# Chamo o node direto em vez de "npm start": o node recebe o sinal de parada
# do Docker e o container desliga na hora, sem processo a mais no meio.
CMD ["node", "dist/server.js"]
