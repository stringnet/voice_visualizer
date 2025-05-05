# main.py (Modificado - v5) - ASEGÚRATE DE DESPLEGAR ESTE CÓDIGO

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
# Importar WebSocketState
from starlette.websockets import WebSocketState
from fastapi.middleware.cors import CORSMiddleware
# ... (ASEGÚRATE que todos tus otros imports estén aquí y sean correctos) ...
from ws_manager import ConnectionManager # Asume que ws_manager.py está actualizado con broadcast
from knowledge_manager import KnowledgeManager # Verifica este import y archivo
from utils.tts_openai import OpenAITTS
from utils.llm_openai import generate_response_with_knowledge
from n8n_webhook import send_to_n8n
import os
import logging

app = FastAPI()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
app.add_middleware(
    CORSMiddleware, # ... (configuración CORS) ...
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
try: # Añadido para mejor log de inicio
    manager = ConnectionManager()
    km = KnowledgeManager()
    tts = OpenAITTS()
    logger.info("Servicios inicializados correctamente.")
except NameError as ne:
     logger.error(f"Error de Nombre al inicializar: {ne}. Verifica imports/archivos .py.", exc_info=True)
     raise ne
except Exception as e:
    logger.error(f"Error inesperado durante la inicialización global: {e}", exc_info=True)
    raise e

# ... (endpoints HTTP /health, /get-knowledge, etc. sin cambios) ...
@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/get-knowledge")
async def get_knowledge():
    try:
        return km.get_knowledge()
    except Exception as e:
        logger.error(f"Error obteniendo conocimiento: {e}")
        raise HTTPException(status_code=500, detail="Error interno al obtener conocimiento")

@app.post("/update-knowledge")
async def update_knowledge(request: Request):
    return await secure_update_knowledge(request, km) # Asume manejo de error interno

@app.post("/reset-knowledge")
async def reset_knowledge(request: Request):
    return await secure_reset_knowledge(request, km) # Asume manejo de error interno


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    client_host = "desconocido"
    connection_valid = False
    try:
        await manager.connect(websocket)
        connection_valid = True
        client_host = websocket.client.host if websocket.client else "desconocido"
        # Usa get_connection_count si lo añadiste a ws_manager
        count_start = manager.get_connection_count() if hasattr(manager, 'get_connection_count') else 'N/A'
        logger.info(f"Cliente conectado: {client_host} (Total: {count_start})")

        while True:
            data = None
            try:
                # Verificar estado ANTES de recibir (FIX para RuntimeError)
                if websocket.client_state == WebSocketState.DISCONNECTED:
                    logger.warning(f"Detectada desconexión de {client_host} al inicio del bucle.")
                    break

                logger.debug(f"Esperando mensaje de {client_host}...")
                data = await websocket.receive_json() # Intentar recibir

            except WebSocketDisconnect:
                # Cliente desconectó MIENTRAS esperábamos en receive_json
                logger.info(f"Desconexión detectada para {client_host} durante receive_json.")
                break # Salir del bucle while

            # Procesar si recibimos datos
            if data:
                user_text = data.get("text")
                if user_text:
                    logger.info(f"Texto recibido de {client_host}: {user_text}")
                    audio_data = None # FIX para NameError: Inicializar
                    try:
                        # Procesamiento IA y TTS
                        context = km.get_knowledge()
                        system_prompt = f"Eres {context['rol']}. Usa el siguiente conocimiento para responder: {context['conocimientos']}"
                        respuesta = await generate_response_with_knowledge(system_prompt, user_text)
                        logger.info(f"Respuesta LLM generada para {client_host}: {respuesta[:50]}...")
                        tts_response = await tts.synthesize_speech(respuesta)

                        if tts_response:
                             audio_data = await tts_response.aread()
                             logger.info(f"Audio TTS generado para {client_host}: {len(audio_data)} bytes")
                        else:
                             logger.error(f"TTS no devolvió respuesta válida para {client_host}")

                        # Broadcast de la respuesta
                        if audio_data:
                            count_bc = manager.get_connection_count() if hasattr(manager, 'get_connection_count') else 'N/A'
                            logger.info(f"Enviando audio a todos ({count_bc} cliente(s)) por solicitud de {client_host}...")
                            await manager.broadcast_bytes(audio_data)
                            await manager.broadcast_text("[✔] Audio generado y enviado correctamente.")
                            await send_to_n8n(user_text)
                        else:
                            logger.warning(f"No se generó audio válido para solicitud de {client_host}.")
                            await manager.broadcast_text("[ERROR] No se pudo generar audio.")

                    except Exception as e_inner:
                        # Error durante procesamiento IA/TTS
                        error_msg = f"[❌] Error procesando texto '{user_text[:30]}...': {type(e_inner).__name__}"
                        logger.error(f"{error_msg} para {client_host}", exc_info=True)
                        await manager.broadcast_text(error_msg)

                else: # Si no hay 'text' en JSON
                     logger.warning(f"Mensaje JSON recibido de {client_host} sin clave 'text': {data}")

    except WebSocketDisconnect: # Captura desconexión fuera del receive_json específico
        logger.info(f"Desconexión limpia (WebSocketDisconnect) para: {client_host}")
        break # Salir del bucle while

    except Exception as e_outer: # Otros errores inesperados en el bucle
        error_msg_outer = f"Error inesperado en bucle WebSocket para {client_host}: {type(e_outer).__name__}"
        logger.error(error_msg_outer, exc_info=True)
        break # Salir del bucle en caso de error grave también

# Fin del while True (se sale con break)
