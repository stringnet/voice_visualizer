# main.py (Original + Cambios MÍNIMOS para usar Broadcast)

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import HTTPException
from utils.tts_openai import OpenAITTS
from utils.llm_openai import generate_response_with_knowledge
# Importamos el ConnectionManager actualizado (debe tener broadcast_*)
from ws_manager import ConnectionManager
# Asegúrate que este import sigue funcionando en tu estructura actual
from knowledge_manager import KnowledgeManager, secure_update_knowledge, secure_reset_knowledge
from n8n_webhook import send_to_n8n
import os
import logging # Añadimos logging si no lo tenías

app = FastAPI()

# Configurar logging básico (añadido para mejor depuración)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# CORS (igual que tu original)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inicialización (igual que tu original)
# Asume que ws_manager.py y knowledge_manager.py están accesibles
# y que las clases se llaman así.
try:
    manager = ConnectionManager()
    km = KnowledgeManager()
    tts = OpenAITTS()
    logger.info("Servicios manager, km, tts inicializados.")
except NameError as ne:
     logger.error(f"Error de Nombre al inicializar: {ne}. Verifica los imports y archivos .py.")
     raise ne
except Exception as e:
    logger.error(f"Error inesperado durante la inicialización global: {e}", exc_info=True)
    raise e


# Endpoints HTTP (igual que tu original)
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


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    client_host = "desconocido"
    connection_valid = False
    try:
        # Aceptar y registrar conexión (igual que tu original)
        await manager.connect(websocket)
        connection_valid = True
        client_host = websocket.client.host if websocket.client else "desconocido"
        logger.info(f"Cliente conectado: {client_host} (Total: {manager.get_connection_count()})") # Usar get_connection_count si existe

        while True:
            data = None
            try:
                # Esperar mensajes JSON (igual que tu original)
                logger.debug(f"Esperando mensaje de {client_host}...")
                data = await websocket.receive_json()

            except WebSocketDisconnect:
                logger.info(f"Desconexión detectada para {client_host} durante receive_json.")
                break # Salir del bucle si desconecta mientras espera

            # Procesar mensaje si se recibió
            if data:
                user_text = data.get("text")
                # user_audio = data.get("audio") # Sin cambios

                if user_text:
                    logger.info(f"Texto recibido de {client_host}: {user_text}")
                    audio_data = None # Inicializar por si falla TTS/LLM
                    try:
                        # --- Procesamiento IA y TTS (Sin cambios en esta lógica) ---
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

                        # --- *** INICIO DE CAMBIOS *** ---
                        # Enviar la respuesta usando el MANAGER (BROADCAST)
                        if audio_data:
                            count = manager.get_connection_count() if hasattr(manager, 'get_connection_count') else 'N/A'
                            logger.info(f"Enviando audio a todos ({count} cliente(s)) por solicitud de {client_host}...")
                            # ANTES: await websocket.send_bytes(audio_data)
                            await manager.broadcast_bytes(audio_data) # <-- CAMBIO
                            # ANTES: await websocket.send_text("[✔] Audio generado y enviado correctamente.")
                            await manager.broadcast_text("[✔] Audio generado y enviado correctamente.") # <-- CAMBIO
                            await send_to_n8n(user_text) # n8n no cambia
                        else:
                            logger.warning(f"No se generó audio válido para solicitud de {client_host}.")
                            # ANTES: await websocket.send_text("[ERROR] Audio generado está vacío.")
                            await manager.broadcast_text("[ERROR] Audio generado está vacío.") # <-- CAMBIO
                        # --- *** FIN DE CAMBIOS *** ---

                    except Exception as e_inner:
                        # Error durante procesamiento IA/TTS
                        error_msg = f"[❌] Error procesando texto '{user_text[:30]}...': {type(e_inner).__name__}"
                        logger.error(f"{error_msg} para {client_host}", exc_info=True)
                        # --- *** INICIO DE CAMBIOS *** ---
                        # Enviar error usando el MANAGER (BROADCAST)
                        # ANTES: await websocket.send_text(error_msg)
                        await manager.broadcast_text(error_msg) # <-- CAMBIO
                        # --- *** FIN DE CAMBIOS *** ---

                # elif user_audio: # Sin cambios
                #     pass
                else: # Sin cambios
                     logger.warning(f"Mensaje JSON recibido de {client_host} sin clave 'text': {data}")

    except WebSocketDisconnect: # Sin cambios en este bloque
        logger.info(f"Desconexión limpia (WebSocketDisconnect) para: {client_host}")

    except Exception as e_outer: # Sin cambios en este bloque
        error_msg_outer = f"Error grave en WebSocket para {client_host}: {type(e_outer).__name__}"
        logger.error(error_msg_outer, exc_info=True)

    finally: # Sin cambios en este bloque
        if connection_valid:
             logger.info(f"Limpiando conexión en finally para: {client_host}")
             manager.disconnect(websocket)
        else:
             logger.info(f"Conexión para {client_host} nunca fue válida o falló al aceptar, no se limpia del manager.")


if __name__ == "__main__": # Sin cambios
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=True) # Mantener reload=True si así estaba
