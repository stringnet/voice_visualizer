from fastapi import FastAPI, Request, UploadFile, File
from fastapi.responses import JSONResponse
import websockets
import asyncio
import json
import openai
import os
import tempfile

app = FastAPI()

# API Key de OpenAI desde variable de entorno
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
    allowed_types = [
        "audio/webm", "audio/mpeg", "audio/mp3", "audio/wav",
        "audio/ogg", "audio/x-m4a", "video/mp4"
    ]
    
    if audio.content_type not in allowed_types:
        return JSONResponse(
            content={"error": f"Tipo de archivo no soportado: {audio.content_type}"},
            status_code=400
        )

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".audio") as tmp:
            tmp.write(await audio.read())
            tmp_path = tmp.name

        with open(tmp_path, "rb") as f:
            transcript = openai.Audio.transcribe("whisper-1", f)

        return JSONResponse(content={
            "status": "ok",
            "transcripcion": transcript["text"]
        })

    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
