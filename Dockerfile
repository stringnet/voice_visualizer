# Dockerfile para Voice Visualizer
FROM node:18-slim

WORKDIR /app

COPY package.json ./
RUN npm install

COPY public ./public

# EXPOSE correcto: el puerto que serve usa
EXPOSE 3000

# Comando de inicio
CMD ["npx", "serve", "-s", "public", "-l", "3000"]
