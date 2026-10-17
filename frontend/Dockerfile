# Dockerfile do frontend (React + Vite)
# Multi-stage: compilo com Node e sirvo os arquivos prontos com o Nginx.

# ---------- Etapa 1: build ----------
FROM node:22-alpine AS build

WORKDIR /app

# Dependências primeiro, pra aproveitar o cache
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# As variáveis VITE_ entram no código na hora do build, por isso são ARG.
# A URL da API é /api porque o Nginx repassa pro backend.
ARG VITE_API_URL=/api
ARG VITE_SUPABASE_URL=
ARG VITE_SUPABASE_ANON_KEY=
ENV VITE_API_URL=$VITE_API_URL \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

COPY . .
RUN npm run build

# ---------- Etapa 2: Nginx ----------
# Na imagem final não vai Node nem node_modules, só o Nginx e a pasta dist.
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
