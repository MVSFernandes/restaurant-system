# Dockerfile do frontend (React + Vite)
# Multi-stage: compilo com Node e sirvo os arquivos prontos com o Nginx.

# ---------- Etapa 1: build ----------
FROM node:22-alpine AS build

WORKDIR /app

# Dependências primeiro, pra aproveitar o cache
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Nenhum valor de instalação entra no build: a mesma imagem serve todas elas.
# A configuração vem das variáveis PUBLIC_* quando o container sobe.
COPY . .
RUN npm run build
RUN npm run check:bundle

# ---------- Etapa 2: Nginx ----------
# Na imagem final não vai Node nem node_modules, só o Nginx e a pasta dist.
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# O entrypoint do Nginx roda este script ao subir. Sem configuração válida,
# o container não sobe. O jq interpreta o payload da chave JWT.
RUN apk add --no-cache jq
COPY docker/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh

EXPOSE 80
