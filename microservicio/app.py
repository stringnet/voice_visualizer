from fastapi import FastAPI, Request, UploadFile, File
from fastapi.responses import JSONResponse
import websockets
import asyncio
import json
import openai
import os
import tempfile

app = FastAPI()

# Configura tu API Key de OpenAI aquí o con una variable de entorno
openai.api_key = os.getenv("OPENAI_API_KEY")  # Puedes poner directamente el string para pruebas

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
    if audio.content_type not in ["audio/webm", "audio/mpeg", "audio/mp3", "audio/wav"]:
        return JSONResponse(content={"error": "Formato de audio no soportado"}, status_code=400)

    try:
        # Guardar archivo temporalmente
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
            tmp.write(await audio.read())
            tmp_path = tmp.name

        # Llamar a Whisper API de OpenAI
        with open(tmp_path, "rb") as f:
            transcript = openai.Audio.transcribe("whisper-1", f)

        return JSONResponse(content={
            "status": "ok",
            "transcripcion": transcript["text"]
        })

    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
