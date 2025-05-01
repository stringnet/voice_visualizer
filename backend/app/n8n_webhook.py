# app/n8n_webhook.py corregido

import httpx
import os

# Leer la URL del webhook de las variables de entorno
N8N_WEBHOOK_URL = os.getenv("N8N_WEBHOOK_URL")

async def send_to_n8n(text: str):
    """Envía un mensaje de texto al Webhook de n8n"""
    if not N8N_WEBHOOK_URL:
        print("❗ No se configuró N8N_WEBHOOK_URL en variables de entorno")
        return

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                N8N_WEBHOOK_URL,
                json={"text": text},
                timeout=10
            )
            response.raise_for_status()
            print(f"\u2705 Mensaje enviado correctamente a n8n: {text}")
    except Exception as e:
        print(f"\u274c Error enviando mensaje a n8n: {str(e)}")
