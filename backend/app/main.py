# main.py (Modificado)

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import HTTPException
from utils.tts_openai import OpenAITTS
from utils.llm_openai import generate_response_with_knowledge
# Asumimos que ws_manager.py define ConnectionManager
# y que ConnectionManager tiene métodos broadcast_bytes y broadcast_text
from ws_manager import ConnectionManager
from knowledge_manager import KnowledgeManager, secure_update_knowledge, secure_reset_knowledge
from n8n_webhook import send_to_n8n
import os
import logging # Añadir logging

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
    # Registrar la conexión entrante
    # Idealmente, connect debería devolver un ID único o manejar la identificación
    # pero por ahora, solo registraremos la conexión.
    await manager.connect(websocket)
    client_host = websocket.client.host if websocket.client else "desconocido"
    logger.info(f"Cliente conectado: {client_host}")

    try:
        while True:
            # Esperar mensajes JSON
            data = await websocket.receive_json()
            user_text = data.get("text")
            # user_audio = data.get("audio") # Mantener para futura implementación

            if user_text:
                logger.info(f"Texto recibido de {client_host}: {user_text}")
                try:
                    # --- Procesamiento IA y TTS (igual que antes) ---
                    context = km.get_knowledge()
                    system_prompt = f"Eres {context['rol']}. Usa el siguiente conocimiento para responder: {context['conocimientos']}"
                    respuesta = await generate_response_with_knowledge(system_prompt, user_text)
                    logger.info(f"Respuesta LLM generada: {respuesta[:50]}...") # Log corto
                    tts_response = await tts.synthesize_speech(respuesta)
                    audio_data = await tts_response.aread()
                    logger.info(f"Audio TTS generado: {len(audio_data)} bytes")

                    # --- *** CAMBIO PRINCIPAL AQUÍ *** ---
                    # Enviar la respuesta a TODOS los clientes conectados a través del manager
                    # En lugar de solo al 'websocket' que envió el mensaje.
                    if audio_data:
                        logger.info("Enviando audio a todos los clientes conectados...")
                        # Necesitamos un método en ConnectionManager para hacer broadcast
                        await manager.broadcast_bytes(audio_data)
                        await manager.broadcast_text("[✔] Audio generado y enviado correctamente.")
                        # La llamada a n8n sigue siendo igual
                        await send_to_n8n(user_text)
                    else:
                        logger.warning("Audio vacío generado por TTS.")
                        await manager.broadcast_text("[ERROR] Audio generado está vacío.")
                    # --- *** FIN DEL CAMBIO PRINCIPAL *** ---

                except Exception as e:
                    error_msg = f"[❌] Error procesando texto '{user_text[:30]}...': {str(e)}"
                    logger.error(error_msg, exc_info=True) # Log con traceback
                    # Enviar error a todos los clientes
                    await manager.broadcast_text(error_msg)

            # elif user_audio: # Futuro
            #     pass
            else:
                 logger.warning(f"Mensaje JSON recibido de {client_host} sin clave 'text': {data}")
                 # Opcional: enviar un mensaje de error de formato
                 # await manager.broadcast_text("[ERROR] Formato de mensaje inválido.")


    except WebSocketDisconnect:
        logger.info(f"Cliente desconectado: {client_host}")
        manager.disconnect(websocket) # Desregistrar al desconectar
        # No intentar enviar mensaje aquí porque la conexión ya está cerrada
    except Exception as e:
        # Capturar otros errores inesperados en el bucle principal
        logger.error(f"Error inesperado en bucle WebSocket para {client_host}: {e}", exc_info=True)
        manager.disconnect(websocket) # Asegurar desconexión en caso de error
        # No intentar enviar mensaje aquí porque la conexión podría estar rota


# --- Implementación Simple de ConnectionManager (ws_manager.py) ---
# Si no tienes este archivo, créalo (ws_manager.py).
# Si ya lo tienes, asegúrate de que tenga métodos similares a estos.

# class ConnectionManager:
#     def __init__(self):
#         self.active_connections: list[WebSocket] = []
#         self.logger = logging.getLogger(__name__ + ".ConnectionManager")

#     async def connect(self, websocket: WebSocket):
#         await websocket.accept()
#         self.active_connections.append(websocket)
#         self.logger.info(f"Nueva conexión aceptada. Total: {len(self.active_connections)}")

#     def disconnect(self, websocket: WebSocket):
#         if websocket in self.active_connections:
#             self.active_connections.remove(websocket)
#             self.logger.info(f"Conexión eliminada. Total: {len(self.active_connections)}")
#         else:
#             self.logger.warning("Intento de desconectar una conexión no registrada.")


#     async def broadcast_text(self, message: str):
#         disconnected_clients = []
#         for connection in self.active_connections:
#             try:
#                 await connection.send_text(message)
#             except (WebSocketDisconnect, ConnectionClosedOK, RuntimeError) as e:
#                 # Marcar para eliminar si falla el envío (probablemente desconectado)
#                 self.logger.warning(f"Error enviando texto a un cliente (será eliminado): {e}")
#                 disconnected_clients.append(connection)
#             except Exception as e:
#                 self.logger.error(f"Error inesperado enviando texto a un cliente: {e}", exc_info=True)
#                 disconnected_clients.append(connection) # Marcar también si hay error grave

#         # Limpiar clientes desconectados después de iterar
#         for client in disconnected_clients:
#             self.disconnect(client)


#     async def broadcast_bytes(self, data: bytes):
#         disconnected_clients = []
#         for connection in self.active_connections:
#             try:
#                 await connection.send_bytes(data)
#             except (WebSocketDisconnect, ConnectionClosedOK, RuntimeError) as e:
#                 # Marcar para eliminar si falla el envío
#                 self.logger.warning(f"Error enviando bytes a un cliente (será eliminado): {e}")
#                 disconnected_clients.append(connection)
#             except Exception as e:
#                 self.logger.error(f"Error inesperado enviando bytes a un cliente: {e}", exc_info=True)
#                 disconnected_clients.append(connection)

#         # Limpiar clientes desconectados
#         for client in disconnected_clients:
#             self.disconnect(client)


# # Asegúrate de inicializar el manager en main.py como antes:
# # manager = ConnectionManager()


# --- Fin Implementación Simple ---


if __name__ == "__main__":
    import uvicorn
    # reload=True es útil para desarrollo, quítalo o ponlo a False en producción
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=False)
