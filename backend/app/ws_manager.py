# app/ws_manager.py

from fastapi import WebSocket
# Importar excepciones relevantes para manejo de errores
from starlette.websockets import WebSocketDisconnect
# ConnectionClosedOK puede venir de la librería 'websockets' si se usa directamente
# pero Starlette/Uvicorn a menudo las envuelven. RuntimeError también es común.
# from websockets.exceptions import ConnectionClosedOK
import logging # Importar logging

# Configurar un logger específico para este módulo
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
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"Cliente desconectado: {client_host}. Total conexiones: {len(self.active_connections)}")
        # else:
            # Puede ocurrir si se intenta desconectar dos veces o si hubo un error previo
            # logger.warning(f"Intento de desconectar cliente {client_host} que ya no estaba en la lista activa.")

    async def broadcast_text(self, message: str):
        """Envía un mensaje de texto a todas las conexiones activas."""
        # Creamos una lista de clientes a eliminar por si fallan durante el envío
        disconnected_clients: list[WebSocket] = []
        # Iteramos sobre una copia de la lista por si se modifica durante la iteración
        # aunque la eliminación se hace al final.
        logger.info(f"Broadcasting texto a {len(self.active_connections)} cliente(s)...")
        active_list_copy = self.active_connections[:]
        for connection in active_list_copy:
            client_host = connection.client.host if connection.client else "desconocido"
            try:
                await connection.send_text(message)
            except (WebSocketDisconnect, RuntimeError) as e:
                # Estas excepciones ocurren si el cliente se desconectó o la conexión se cerró
                logger.warning(f"Error enviando texto a {client_host} (será desconectado): {type(e).__name__}")
                disconnected_clients.append(connection)
            except Exception as e:
                # Capturar otros posibles errores durante el envío
                logger.error(f"Error inesperado enviando texto a {client_host} (será desconectado): {e}", exc_info=False) # Poner True para ver traceback
                disconnected_clients.append(connection)

        # Limpiar la lista de conexiones eliminando los clientes que fallaron
        if disconnected_clients:
            logger.info(f"Limpiando {len(disconnected_clients)} cliente(s) desconectado(s) después del broadcast.")
            for client in disconnected_clients:
                # Usamos self.disconnect para asegurar que se elimine de la lista principal
                self.disconnect(client)

    async def broadcast_bytes(self, data: bytes):
        """Envía datos binarios (bytes) a todas las conexiones activas."""
        disconnected_clients: list[WebSocket] = []
        logger.info(f"Broadcasting {len(data)} bytes a {len(self.active_connections)} cliente(s)...")
        active_list_copy = self.active_connections[:]
        for connection in active_list_copy:
            client_host = connection.client.host if connection.client else "desconocido"
            try:
                await connection.send_bytes(data)
            except (WebSocketDisconnect, RuntimeError) as e:
                logger.warning(f"Error enviando bytes a {client_host} (será desconectado): {type(e).__name__}")
                disconnected_clients.append(connection)
            except Exception as e:
                logger.error(f"Error inesperado enviando bytes a {client_host} (será desconectado): {e}", exc_info=False) # Poner True para ver traceback
                disconnected_clients.append(connection)

        # Limpiar la lista de conexiones
        if disconnected_clients:
            logger.info(f"Limpiando {len(disconnected_clients)} cliente(s) desconectado(s) después del broadcast.")
            for client in disconnected_clients:
                self.disconnect(client)
