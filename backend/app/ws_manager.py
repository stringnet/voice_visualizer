# app/ws_manager.py (Actualizado)

from fastapi import WebSocket
# Importar excepciones relevantes para manejo de errores
from starlette.websockets import WebSocketDisconnect
# ConnectionClosedOK puede venir de la librería 'websockets' si se usa directamente
# pero Starlette/Uvicorn a menudo las envuelven. RuntimeError también es común.
# from websockets.exceptions import ConnectionClosedOK
import logging

# Configurar un logger específico para este módulo
# (Si tienes una configuración de logging central, úsala; si no, esto es básico)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        """Inicializa el gestor con una lista vacía de conexiones activas."""
        self.active_connections: list[WebSocket] = []
        logger.info("ConnectionManager inicializado.")

    async def connect(self, websocket: WebSocket):
        """Acepta una nueva conexión WebSocket y la añade a la lista."""
        await websocket.accept()
        self.active_connections.append(websocket)
        client_host = websocket.client.host if websocket.client else "desconocido"
        logger.info(f"Cliente conectado: {client_host}. Total conexiones: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        """Elimina una conexión WebSocket de la lista de activas."""
        client_host = websocket.client.host if websocket.client else "desconocido"
        # Comprobar si todavía está en la lista antes de intentar eliminar
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"Cliente desconectado: {client_host}. Total conexiones: {len(self.active_connections)}")
        # else:
            # logger.warning(f"Intento de desconectar cliente {client_host} que ya no estaba en la lista.")

    # --- NUEVO MÉTODO ---
    async def broadcast_text(self, message: str):
        """Envía un mensaje de texto a todas las conexiones activas."""
        # Creamos una lista de clientes a eliminar por si fallan durante el envío
        disconnected_clients: list[WebSocket] = []
        # Iteramos sobre una copia por seguridad si la lista se modifica
        active_list_copy = self.active_connections[:]
        if not active_list_copy:
             logger.warning("Broadcast texto: No hay clientes activos a los que enviar.")
             return

        logger.info(f"Broadcasting texto a {len(active_list_copy)} cliente(s)...")
        for connection in active_list_copy:
            client_host = connection.client.host if connection.client else "desconocido"
            try:
                await connection.send_text(message)
            except (WebSocketDisconnect, RuntimeError) as e:
                # Marcar para eliminar si falla el envío (probablemente desconectado)
                logger.warning(f"Error enviando texto a {client_host} (será desconectado): {type(e).__name__}")
                disconnected_clients.append(connection)
            except Exception as e:
                # Capturar otros posibles errores durante el envío
                logger.error(f"Error inesperado enviando texto a {client_host} (será desconectado): {e}", exc_info=False)
                disconnected_clients.append(connection)

        # Limpiar la lista de conexiones eliminando los clientes que fallaron
        if disconnected_clients:
            logger.info(f"Limpiando {len(disconnected_clients)} cliente(s) desconectado(s) después del broadcast de texto.")
            for client in disconnected_clients:
                # Usamos self.disconnect que ya tiene la lógica de eliminar de la lista
                self.disconnect(client)

    # --- NUEVO MÉTODO ---
    async def broadcast_bytes(self, data: bytes):
        """Envía datos binarios (bytes) a todas las conexiones activas."""
        disconnected_clients: list[WebSocket] = []
        active_list_copy = self.active_connections[:]
        if not active_list_copy:
             logger.warning("Broadcast bytes: No hay clientes activos a los que enviar.")
             return

        logger.info(f"Broadcasting {len(data)} bytes a {len(active_list_copy)} cliente(s)...")
        for connection in active_list_copy:
            client_host = connection.client.host if connection.client else "desconocido"
            try:
                await connection.send_bytes(data)
            except (WebSocketDisconnect, RuntimeError) as e:
                logger.warning(f"Error enviando bytes a {client_host} (será desconectado): {type(e).__name__}")
                disconnected_clients.append(connection)
            except Exception as e:
                logger.error(f"Error inesperado enviando bytes a {client_host} (será desconectado): {e}", exc_info=False)
                disconnected_clients.append(connection)

        # Limpiar la lista de conexiones
        if disconnected_clients:
            logger.info(f"Limpiando {len(disconnected_clients)} cliente(s) desconectado(s) después del broadcast de bytes.")
            for client in disconnected_clients:
                self.disconnect(client)

    # --- NUEVO MÉTODO (Opcional, para logging) ---
    def get_connection_count(self) -> int:
         """Devuelve el número actual de conexiones activas."""
         return len(self.active_connections)
