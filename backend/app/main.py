# main.py (Modificado - v3)

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import HTTPException
from starlette.websockets import WebSocketState # Importar para chequear estado si fuera necesario
from utils.tts_openai import OpenAITTS
from utils.llm_openai import generate_response_with_knowledge
# Asumimos que ws_manager.py tiene ConnectionManager con broadcast_bytes/text
from ws_manager import ConnectionManager
from knowledge_manager import KnowledgeManager, secure_update_knowledge, secure_reset_knowledge
from n8n_webhook import send_to_n8n
import os
import logging

app = FastAPI()

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# CORS (igual que antes)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inicialización (igual que antes)
manager = ConnectionManager()
km = KnowledgeManager()
tts = OpenAITTS()

# Endpoints HTTP (igual que antes)
@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/get-knowledge")
async def get_knowledge():
    return km.get_knowledge()

@app.post("/update-knowledge")
async def update_knowledge(request: Request):
    return await secure_update_knowledge(request, km)

@app.post("/reset-knowledge")
async def reset_knowledge(request: Request):
    return await secure_reset_knowledge(request, km)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    client_host = "desconocido" # Valor por defecto
    try:
        # Registrar la conexión entrante
        await manager.connect(websocket)
        client_host = websocket.client.host if websocket.client else "desconocido"
        logger.info(f"Cliente conectado: {client_host}")

        while True:
            # Esperar mensajes JSON
            # Si el cliente desconecta aquí, debería lanzar WebSocketDisconnect
            data = await websocket.receive_json()
            user_text = data.get("text")
            # user_audio = data.get("audio") # Futuro

            if user_text:
                logger.info(f"Texto recibido de {client_host}: {user_text}")
                try:
                    # --- Procesamiento IA y TTS ---
                    context = km.get_knowledge()
                    system_prompt = f"Eres {context['rol']}. Usa el siguiente conocimiento para responder: {context['conocimientos']}"
                    respuesta = await generate_response_with_knowledge(system_prompt, user_text)
                    logger.info(f"Respuesta LLM generada para {client_host}: {respuesta[:50]}...")
                    tts_response = await tts.synthesize_speech(respuesta)
                    audio_data = await tts_response.aread()
                    logger.info(f"Audio TTS generado para {client_host}: {len(audio_data)} bytes")

                    # --- Envío de Respuesta vía Broadcast ---
                    if audio_data:
                        logger.info(f"Enviando audio a todos ({manager.get_connection_count()} cliente(s)) por solicitud de {client_host}...")
                        await manager.broadcast_bytes(audio_data)
                        await manager.broadcast_text("[✔] Audio generado y enviado correctamente.")
                        await send_to_n8n(user_text) # n8n sigue igual
                    else:
                        logger.warning(f"Audio vacío generado por TTS para solicitud de {client_host}.")
                        await manager.broadcast_text("[ERROR] Audio generado está vacío.")

                except Exception as e_inner:
                    # --- Error DURANTE el procesamiento IA/TTS ---
                    error_msg = f"[❌] Error procesando texto '{user_text[:30]}...' para {client_host}: {type(e_inner).__name__}"
                    logger.error(error_msg, exc_info=True)
                    # Enviar error a todos los clientes conectados (no solo al que originó)
                    # porque no sabemos si el que originó sigue conectado si fue 'espectroapi'.
                    await manager.broadcast_text(error_msg)
                    # Continuar el bucle while para este cliente si aún está conectado? O romper?
                    # Podríamos continuar esperando más mensajes de este cliente si sigue conectado.

            # elif user_audio: # Futuro
            #     pass
            else:
                 logger.warning(f"Mensaje JSON recibido de {client_host} sin clave 'text': {data}")
                 # Opcional: enviar un mensaje de error de formato vía broadcast
                 # await manager.broadcast_text("[ERROR] Formato de mensaje inválido.")


    except WebSocketDisconnect:
        # El cliente cerró la conexión limpiamente mientras esperábamos en receive_json
        logger.info(f"Cliente desconectado limpiamente: {client_host}")
        # El bloque finally se encargará de llamar a manager.disconnect()

    except Exception as e_outer:
        # --- *** MANEJO DE ERRORES INESPERADOS EN EL BUCLE *** ---
        # Esto captura errores como el "RuntimeError: WebSocket is not connected..."
        # que ocurría al intentar llamar a receive_json en una conexión ya cerrada.
        # También captura otros errores inesperados fuera del procesamiento de texto.

        error_msg_outer = f"Error inesperado en bucle WebSocket para {client_host}: {type(e_outer).__name__}"
        logger.error(error_msg_outer, exc_info=True) # Loggear el error completo

        # !! IMPORTANTE: NO intentar enviar mensaje usando 'websocket' aquí !!
        # La conexión 'websocket' específica de esta instancia podría ser la que causó
        # el error (ej: ya estaba cerrada). El broadcast se encarga de los demás.

        # Salimos del bucle while True para esta instancia del handler.
        # El bloque finally se encargará de la desconexión del manager.
        # --- *** FIN DE LA MODIFICACIÓN *** ---

    finally:
        # Este bloque se ejecuta siempre al salir del try (sea por desconexión limpia,
        # error manejado con 'break', o error no capturado).
        # Asegura que la conexión se elimine del manager.
        logger.info(f"Limpiando conexión para: {client_host}")
        manager.disconnect(websocket)

# Añadir método get_connection_count a ConnectionManager si no existe
# Ejemplo en ws_manager.py:
# class ConnectionManager:
#     ... (métodos connect, disconnect, broadcast_*) ...
#     def get_connection_count(self) -> int:
#          return len(self.active_connections)


if __name__ == "__main__":
    import uvicorn
    # Quitar reload=True para producción
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=False)
