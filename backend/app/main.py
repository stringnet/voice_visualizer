# main.py (Modificado - v4)

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
# Importar WebSocketState
from starlette.websockets import WebSocketState
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
# ... (otras inicializaciones igual) ...

# ... (endpoints HTTP igual que antes) ...


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    client_host = "desconocido"
    connection_valid = False # Flag para saber si se aceptó
    try:
        await manager.connect(websocket)
        connection_valid = True # Se aceptó correctamente
        client_host = websocket.client.host if websocket.client else "desconocido"
        logger.info(f"Cliente conectado: {client_host}")

        while True:
            # --- *** NUEVA VERIFICACIÓN AQUÍ *** ---
            # Antes de intentar recibir, verificar si el cliente sigue conectado.
            # Esto debería prevenir el error en receive_json para conexiones cerradas.
            if websocket.client_state == WebSocketState.DISCONNECTED:
                logger.warning(f"Detectada desconexión de {client_host} antes de recibir. Saliendo del bucle.")
                break # Salir del bucle while True si ya está desconectado
            # --- *** FIN DE LA VERIFICACIÓN *** ---

            logger.debug(f"Esperando mensaje de {client_host}...") # Log útil para depurar
            data = await websocket.receive_json() # Intentar recibir
            user_text = data.get("text")

            if user_text:
                logger.info(f"Texto recibido de {client_host}: {user_text}")
                try:
                    # ... (Procesamiento LLM/TTS y Broadcasts vía manager igual que antes) ...
                    # ... (generar respuesta, audio_data) ...
                    if audio_data:
                         logger.info(f"Enviando audio a todos ({manager.get_connection_count()} cliente(s)) por solicitud de {client_host}...")
                         await manager.broadcast_bytes(audio_data)
                         await manager.broadcast_text("[✔] Audio generado y enviado correctamente.")
                         await send_to_n8n(user_text)
                    else:
                         logger.warning(f"Audio vacío generado por TTS para solicitud de {client_host}.")
                         await manager.broadcast_text("[ERROR] Audio generado está vacío.")

                except Exception as e_inner:
                    error_msg = f"[❌] Error procesando texto '{user_text[:30]}...' para {client_host}: {type(e_inner).__name__}"
                    logger.error(error_msg, exc_info=True)
                    await manager.broadcast_text(error_msg) # Notificar a los demás clientes
                    # No salimos del bucle aquí, el cliente podría seguir conectado y enviar más

            else:
                 logger.warning(f"Mensaje JSON recibido de {client_host} sin clave 'text': {data}")

    except WebSocketDisconnect:
        logger.info(f"Cliente desconectado limpiamente: {client_host}")
        # El finally se encarga del manager.disconnect

    except Exception as e_outer:
        # Errores inesperados fuera del procesamiento de texto (ej: al aceptar conexión, parsear JSON inicial)
        error_msg_outer = f"Error grave en WebSocket para {client_host}: {type(e_outer).__name__}"
        logger.error(error_msg_outer, exc_info=True)
        # El finally se encarga del manager.disconnect

    finally:
        # Asegurarse de desconectar del manager si la conexión fue válida alguna vez
        if connection_valid:
             logger.info(f"Limpiando conexión en finally para: {client_host}")
             manager.disconnect(websocket)
        else:
             logger.info(f"Conexión para {client_host} nunca fue válida o falló al aceptar, no se limpia del manager.")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=False)
