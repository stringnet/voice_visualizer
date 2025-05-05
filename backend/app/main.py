# main.py (v6 - CORREGIDO el SyntaxError: 'break' outside loop)

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from starlette.websockets import WebSocketState
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import HTTPException
# Asegúrate de que todos estos imports son correctos para tu estructura de proyecto
from utils.tts_openai import OpenAITTS
from utils.llm_openai import generate_response_with_knowledge
from ws_manager import ConnectionManager # Debe tener broadcast_* y get_connection_count (opcional)
from knowledge_manager import KnowledgeManager, secure_update_knowledge, secure_reset_knowledge
from n8n_webhook import send_to_n8n
import os
import logging
import asyncio # Importar asyncio si vas a usar sleep (aunque se quitó)

app = FastAPI()

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Reemplazar con dominios específicos en producción
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inicialización Global
try:
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


# Endpoints HTTP
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
    return await secure_update_knowledge(request, km)

@app.post("/reset-knowledge")
async def reset_knowledge(request: Request):
    return await secure_reset_knowledge(request, km)


# Endpoint WebSocket Principal
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    client_host = "desconocido"
    connection_valid = False
    try:
        # Aceptar y registrar conexión
        await manager.connect(websocket)
        connection_valid = True
        client_host = websocket.client.host if websocket.client else "desconocido"
        count_start = manager.get_connection_count() if hasattr(manager, 'get_connection_count') else 'N/A'
        logger.info(f"Cliente conectado: {client_host} (Total: {count_start})")

        # Bucle principal para escuchar mensajes del cliente
        while True:
            data = None
            try:
                # Verificar estado antes de recibir (FIX para RuntimeError)
                if websocket.client_state == WebSocketState.DISCONNECTED:
                    logger.warning(f"Detectada desconexión de {client_host} al inicio del bucle.")
                    break # Salir del bucle while True

                logger.debug(f"Esperando mensaje de {client_host}...")
                data = await websocket.receive_json() # Intentar recibir

            except WebSocketDisconnect:
                # Cliente desconectó MIENTRAS esperábamos en receive_json
                logger.info(f"Desconexión detectada para {client_host} durante receive_json.")
                break # <-- ESTE BREAK ESTÁ BIEN, está DENTRO del while True (vía except)

            # Procesar mensaje si se recibió algo
            if data:
                user_text = data.get("text")
                if user_text:
                    logger.info(f"Texto recibido de {client_host}: {user_text}")
                    audio_data = None # FIX para NameError: Inicializar
                    try:
                        # --- Procesamiento IA y TTS ---
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

                        # --- Broadcast de la respuesta ---
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
                        # Continuamos el bucle while para este cliente

                else: # Si no hay 'text' en JSON
                     logger.warning(f"Mensaje JSON recibido de {client_host} sin clave 'text': {data}")

        # Fin del while True (se sale con break desde el except WebSocketDisconnect)

    except WebSocketDisconnect:
         # Esta excepción se captura si el cliente cierra ANTES de que el servidor
         # intente recibir (si el chequeo de client_state no lo detecta) o durante accept/connect.
        logger.info(f"Desconexión limpia (WebSocketDisconnect) externa al bucle para: {client_host}")

    except Exception as e_outer:
        # Otros errores inesperados (ej: fallo al aceptar conexión, error grave no capturado antes)
        error_msg_outer = f"Error grave en WebSocket para {client_host}: {type(e_outer).__name__}"
        logger.error(error_msg_outer, exc_info=True)

    finally:
        # Limpieza final: asegurar desconexión del manager
        # El 'break' fuera de lugar que causaba SyntaxError estaba probablemente
        # mal indentado cerca de este bloque 'finally' o del 'except' anterior.
        # Ya ha sido eliminado.
        if connection_valid:
             logger.info(f"Limpiando conexión en finally para: {client_host}")
             manager.disconnect(websocket)
        else:
             logger.info(f"Conexión para {client_host} nunca fue válida o falló al aceptar, no se limpia del manager.")


if __name__ == "__main__":
    import uvicorn
    # Quitar reload=True en producción
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=False)
