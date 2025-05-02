from fastapi import FastAPI, Request, UploadFile, File
import websockets
import asyncio
import json
import os
import tempfile
from openai import OpenAI
from fastapi.responses import JSONResponse

app = FastAPI()

# Inicializar cliente OpenAI con API Key desde variable de entorno
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
        suffix = os.path.splitext(audio.filename)[-1] or ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(await audio.read())
            tmp_path = tmp.name

        with open(tmp_path, "rb") as f:
            transcription = client.audio.transcriptions.create(
                model="whisper-1",
                file=f
            )
        os.remove(tmp_path)
        return {"transcripcion": transcription.text}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
