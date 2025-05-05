# main.py (Modificado - v5)

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from starlette.websockets import WebSocketState # Necesario para el chequeo
from fastapi.middleware.cors import CORSMiddleware
# ... (otros imports igual que antes) ...
from ws_manager import ConnectionManager
# ... (resto de imports) ...
import logging

app = FastAPI()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
app.add_middleware(
    CORSMiddleware, # ... (configuración CORS igual) ...
)
manager = ConnectionManager()
km = KnowledgeManager()
tts = OpenAITTS()

# ... (endpoints HTTP igual que antes) ...


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    client_host = "desconocido"
    connection_valid = False
    try:
        await manager.connect(websocket)
        connection_valid = True
        client_host = websocket.client.host if websocket.client else "desconocido"
        logger.info(f"Cliente conectado: {client_host}")

        while True:
            data = None # Inicializar data a None en cada iteración
            try:
                 # --- *** FIX PARA RuntimeError: Verificar estado ANTES de recibir *** ---
                 # Si ya está desconectado aquí, no tiene sentido esperar mensaje.
                 # NOTA: client_state puede no ser 100% fiable inmediatamente después
                 # del cierre si no hubo error, por eso el except es importante también.
                 if websocket.client_state == WebSocketState.DISCONNECTED:
                     logger.warning(f"Detectada desconexión de {client_host} al inicio del bucle.")
                     break # Salir del bucle while True

                 logger.debug(f"Esperando mensaje de {client_host}...")
                 data = await websocket.receive_json() # Intentar recibir

            except WebSocketDisconnect:
                # El cliente desconectó limpiamente MIENTRAS esperábamos en receive_json
                logger.info(f"Desconexión detectada para {client_host} durante receive_json.")
                break # Salir del bucle while True

            # Si llegamos aquí sin 'break', recibimos datos
            if data:
                user_text = data.get("text")
                if user_text:
                    logger.info(f"Texto recibido de {client_host}: {user_text}")
                    # --- *** FIX PARA NameError: Inicializar audio_data *** ---
                    audio_data = None # Asegura que la variable exista
                    try:
                        # --- Procesamiento IA y TTS ---
                        context = km.get_knowledge()
                        system_prompt = f"Eres {context['rol']}. Usa el siguiente conocimiento para responder: {context['conocimientos']}"
                        respuesta = await generate_response_with_knowledge(system_prompt, user_text)
                        logger.info(f"Respuesta LLM generada para {client_host}: {respuesta[:50]}...")
                        tts_response = await tts.synthesize_speech(respuesta)
                        # Comprobar si tts_response es válido antes de leer
                        if tts_response:
                             audio_data = await tts_response.aread() # Asignar aquí
                             logger.info(f"Audio TTS generado para {client_host}: {len(audio_data)} bytes")
                        else:
                             logger.error(f"TTS no devolvió respuesta válida para {client_host}")
                             audio_data = None # Asegurarse que sigue siendo None

                        # --- Envío de Respuesta vía Broadcast ---
                        if audio_data:
                            logger.info(f"Enviando audio a todos ({manager.get_connection_count()} cliente(s)) por solicitud de {client_host}...")
                            await manager.broadcast_bytes(audio_data)
                            await manager.broadcast_text("[✔] Audio generado y enviado correctamente.")
                            await send_to_n8n(user_text)
                        else:
                            # Este caso ahora cubre explícitamente el fallo de TTS también
                            logger.warning(f"No se generó audio válido (TTS vacío o error previo) para solicitud de {client_host}.")
                            await manager.broadcast_text("[ERROR] No se pudo generar audio.")

                    except Exception as e_inner:
                        # Error DURANTE el procesamiento IA/TTS (ahora audio_data será None si falló antes)
                        error_msg = f"[❌] Error procesando texto '{user_text[:30]}...': {type(e_inner).__name__}"
                        logger.error(error_msg, exc_info=True)
                        await manager.broadcast_text(error_msg)

                else: # Si data no tiene la clave 'text'
                     logger.warning(f"Mensaje JSON recibido de {client_host} sin clave 'text': {data}")
            # else: Si data es None (podría pasar si receive_json devuelve None por alguna razón?)
            #     logger.warning(f"receive_json devolvió None para {client_host}")
            #     await asyncio.sleep(0.01) # Evitar bucle cerrado si algo va mal

    except Exception as e_outer:
        # Errores inesperados fuera del bucle principal o al aceptar conexión
        # El RuntimeError por receive_json en conexión cerrada debería ser capturado
        # por el except WebSocketDisconnect ahora.
        error_msg_outer = f"Error grave en WebSocket para {client_host}: {type(e_outer).__name__}"
        logger.error(error_msg_outer, exc_info=True)

    finally:
        # Limpieza final: asegurar desconexión del manager
        if connection_valid: # Solo si la conexión se aceptó alguna vez
             logger.info(f"Limpiando conexión en finally para: {client_host}")
             manager.disconnect(websocket)
        else:
             logger.info(f"Conexión para {client_host} nunca fue válida o falló al aceptar, no se limpia del manager.")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=False)
