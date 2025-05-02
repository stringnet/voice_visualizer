from fastapi import FastAPI, Request, UploadFile, File
from fastapi.responses import JSONResponse
import websockets
import asyncio
import json
import tempfile
import os
import openai

app = FastAPI()

# Configuración de OpenAI
openai.api_key = os.getenv("OPENAI_API_KEY")
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
    filename = audio.filename.lower()
    valid_extensions = (".mp3", ".webm", ".wav", ".m4a", ".ogg", ".mp4", ".mpeg")

    if not filename.endswith(valid_extensions):
        return JSONResponse(
            content={"error": f"Extensión no soportada: {filename}"},
            status_code=400
        )

    try:
        suffix = os.path.splitext(filename)[1] or ".mp3"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(await audio.read())
            tmp_path = tmp.name

        with open(tmp_path, "rb") as f:
            transcription = openai.audio.transcriptions.create(
                model="whisper-1",
                file=f
            )

        return {"status": "ok", "transcripcion": transcription.text}
    except Exception as e:
        return {"error": str(e)}
