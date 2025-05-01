¡Bienvenido al proyecto Visualizador Espectro IA!

Este proyecto permite interactuar en tiempo real con un espectro visual (circular animado) que:

Captura mensajes de texto o voz,

Genera respuestas de voz en streaming usando OpenAI TTS,

Actualiza su rol o personalidad en vivo mediante API o Telegram,

Visualiza en Three.js la onda de voz o interacción.

 Tecnologías utilizadas
Frontend: React + Vite + Three.js + Socket.IO Client

Backend: Flask + Flask-SocketIO + OpenAI TTS Streaming API

Base de Datos: SQLite3 (persistente en volumen Docker)

Contenedores: Docker + Docker Compose

Infraestructura recomendada: Easypanel (con Buildpacks o Dockerfiles)

Automatización de roles: n8n + Bot de Telegram

visualizador-espectro-ia/
├── backend/
│   ├── app/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── .env.example
├── frontend/
│   ├── public/
│   ├── src/
│   ├── Dockerfile
│   ├── .env.example
├── docker-compose.yml
├── .gitignore
├── README.md
├── n8n-flow-rol-spectro.json

Frontend disponible en: http://localhost:3000

Backend disponible en: http://localhost:5000

Deploy recomendado en Easypanel
Crear App Backend:

Ruta de código: /backend

Dockerfile en /backend/Dockerfile

Variables de entorno configuradas (NO subir .env a GitHub)

Crear App Frontend:

Ruta de código: /frontend

Dockerfile en /frontend/Dockerfile

Variables de entorno configuradas

 Actualización de Rol y Conocimientos
API protegida en: https://api.visualizador.scanmee.io/knowledge

Métodos disponibles:

GET: obtener rol actual y conocimientos.

POST: actualizar rol o conocimientos.

DELETE: resetear conocimiento.

 Healthchecks integrados
/health en Backend y Frontend para facilitar reinicios automáticos en Easypanel.

Objetivo del proyecto
Crear una experiencia IA interactiva donde el usuario pueda:

Comunicarse en tiempo real,

Visualizar reacciones animadas,

Cambiar personalidades o estilos de interacción en vivo,

Potenciar eventos, shows, presentaciones, entornos educativos y mucho más.














