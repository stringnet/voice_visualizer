# main.py (Versión Final Propuesta - Verifica los Imports!)

# --- ¡¡IMPORTANTE!! VERIFICA ESTOS IMPORTS ---
# Asegúrate de que todos estos archivos (.py) existan en la ubicación correcta
# y que las clases/funciones se llamen exactamente como se importan.
# El error "NameError: name 'KnowledgeManager' is not defined" indica un problema aquí.
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from starlette.websockets import WebSocketState
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import HTTPException
from utils.tts_openai import OpenAITTS # ¿Existe 'utils/tts_openai.py' con la clase 'OpenAITTS'?
from utils.llm_openai import generate_response_with_knowledge # ¿Existe 'utils/llm_openai.py' con esta función?
from ws_manager import ConnectionManager # ¿Existe 'ws_manager.py' con la clase 'ConnectionManager'?
from knowledge_manager import KnowledgeManager, secure_update_knowledge, secure_reset_knowledge # ¿Existe 'knowledge_manager.py' con estas?
from n8n_webhook import send_to_n8n # ¿Existe 'n8n_webhook.py' con esta función?
import os
import logging
# --- FIN DE VERIFICACIÓN DE IMPORTS ---

app = FastAPI()

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Cambiar en producción por dominios específicos
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inicialización Global - ¡Aquí es donde fallaba si KnowledgeManager no se importa bien!
try:
    manager = ConnectionManager()
    km = KnowledgeManager() # <--- Esta línea causaba el NameError si el import falla
    tts = OpenAITTS()
    logger.info("Servicios inicializados correctamente.")
except NameError as ne:
    logger.error(f"Error de Nombre al inicializar: {ne}. Verifica los imports al inicio de main.py y los archivos correspondientes (.py).")
    # Podrías querer salir o manejar esto de forma diferente si un servicio esencial falla al inicio.
    raise ne # Relanzar para que Gunicorn/Uvicorn muestren el fallo al arrancar
except Exception as e:
    logger.error(f"Error inesperado durante la inicialización global: {e}", exc_info=True)
    raise e


# Endpoints HTTP (Sin cambios respecto a tu versión)
@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/get-knowledge")
async def get_knowledge():
    # Añadir try-except por si km no se inicializó correctamente (aunque el error de arriba debería detenerlo)
    try:
        return km.get_knowledge()
    except Exception as e:
        logger.error(f"Error obteniendo conocimiento: {e}")
        raise HTTPException(status_code=500, detail="Error interno al obtener conocimiento")

@app.post("/update-knowledge")
async def update_knowledge(request: Request):
     # Asumiendo que secure_update_knowledge maneja sus propios errores
    return await secure_update_knowledge(request, km)

@app.post("/reset-knowledge")
async def reset_knowledge(request: Request):
    # Asumiendo que secure_reset_knowledge maneja sus propios errores
    return await secure_reset_knowledge(request, km)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    client_host = "desconocido"
    connection_valid = False
    try:
        # Aceptar y registrar conexión
        # El manager.connect ahora incluye el websocket.accept()
        await manager.connect(websocket)
        connection_valid = True
        client_host = websocket.client.host if websocket.client else "desconocido"
        logger.info(f"Cliente conectado: {client_host} (Total: {manager.get_connection_count()})")

        while True:
            data = None
            try:
                # Verificar estado antes de recibir (FIX para RuntimeError)
                if websocket.client_state == WebSocketState.DISCONNECTED:
                    logger.warning(f"Detectada desconexión de {client_host} al inicio del bucle.")
                    break

                # Esperar mensaje
                logger.debug(f"Esperando mensaje de {client_host}...")
                data = await websocket.receive_json()

            except WebSocketDisconnect:
                logger.info(f"Desconexión detectada para {client_host} durante receive_json.")
                break # Salir del bucle while

            # Procesar mensaje si se recibió algo
            if data:
                user_text = data.get("text")
                if user_text:
                    logger.info(f"Texto recibido de {client_host}: {user_text}")
                    audio_data = None # FIX para NameError: Inicializar audio_data
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
                             # audio_data permanece None

                        # Broadcast de la respuesta (audio y/o texto)
                        if audio_data:
                            # Usar get_connection_count() si lo añadiste a ws_manager.py
                            count = manager.get_connection_count() if hasattr(manager, 'get_connection_count') else 'N/A'
                            logger.info(f"Enviando audio a todos ({count} cliente(s)) por solicitud de {client_host}...")
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
                        # Notificar a todos los clientes sobre el error de procesamiento
                        await manager.broadcast_text(error_msg)
                        # Continuamos el bucle para este cliente por si envía más mensajes

                else: # Si no hay 'text' en el JSON
                     logger.warning(f"Mensaje JSON recibido de {client_host} sin clave 'text': {data}")
            # else: Si data es None o vacío (improbable con receive_json)
            #     logger.warning(f"receive_json devolvió None/vacío para {client_host}")
            #     await asyncio.sleep(0.01)

    except WebSocketDisconnect:
         # Esta excepción se captura si el cliente cierra ANTES de que el servidor envíe/reciba
         # o si receive_json detecta cierre limpio.
        logger.info(f"Desconexión limpia (WebSocketDisconnect) para: {client_host}")

    except Exception as e_outer:
        # Otros errores inesperados (ej: fallo al aceptar conexión, error grave no capturado antes)
        error_msg_outer = f"Error grave en WebSocket para {client_host}: {type(e_outer).__name__}"
        logger.error(error_msg_outer, exc_info=True)

    finally:
        # Asegurar la desconexión del manager SIEMPRE que se salga del try/except principal
        if connection_valid: # Solo desconectar si se conectó válidamente
             logger.info(f"Limpiando conexión en finally para: {client_host}")
             manager.disconnect(websocket)
        else:
             logger.info(f"Conexión para {client_host} nunca fue válida o falló al aceptar, no se limpia del manager.")


if __name__ == "__main__":
    import uvicorn
    # Quitar reload=True en producción
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=False)
