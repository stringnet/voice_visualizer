# Dockerfile final para frontend Vite + React

# Etapa 1: Build
FROM node:20-alpine AS build
WORKDIR /app

# Copiar archivos base y dependencias
COPY package.json vite.config.js .env.example index.html ./
COPY public ./public
COPY src ./src

# Instalar dependencias y construir
RUN npm install && npm run build

# Etapa 2: Producción con servidor estático
FROM node:20-alpine AS production
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
