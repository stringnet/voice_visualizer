# app.py
import os
from fastapi import FastAPI, Request, UploadFile, File
from openai import OpenAI
import websockets
import json
import tempfile

app = FastAPI()

# No usar proxies ni argumentos adicionales
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

WEBSOCKET_BACKEND_URL = "wss://backvisualizador.scanmee.io/ws"

@app.post("/ws-message")
async def send_ws_message(request: Request):
    data = await request.json()
    text = data.get("text", "").strip()

    if not text:
        return {"error": "Texto vacío"}

    try:
        async with websockets.connect(WEBSOCKET_BACKEND_URL) as ws:
            await ws.send(json.dumps({"text": text}))
        return {"status": "enviado", "mensaje": text}
    except Exception as e:
        return {"error": str(e)}

@app.post("/transcribe")
async def transcribe_audio(audio: UploadFile = File(...)):
    try:
        # Guardar el archivo temporalmente
        suffix = os.path.splitext(audio.filename)[-1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(await audio.read())
            tmp_path = tmp.name

        # Transcribir usando Whisper
        with open(tmp_path, "rb") as f:
            transcription = client.audio.transcriptions.create(
                model="whisper-1",
                file=f
            )

        return {"transcription": transcription.text}
    except Exception as e:
        return {"error": str(e)}
