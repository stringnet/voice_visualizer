from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import HTTPException
from utils.tts_openai import OpenAITTS
from utils.llm_openai import generate_response_with_knowledge
from ws_manager import ConnectionManager
from knowledge_manager import KnowledgeManager, secure_update_knowledge, secure_reset_knowledge
from n8n_webhook import send_to_n8n
import os

app = FastAPI()

# CORS abierto (puedes restringir por dominios más adelante)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inicialización
manager = ConnectionManager()
km = KnowledgeManager()
tts = OpenAITTS()

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/get-knowledge")
async def get_knowledge():
    return km.get_knowledge()

@app.post("/update-knowledge")
async def update_knowledge(request: Request):
    return await secure_update_knowledge(request, km)

@app.post("/reset-knowledge")
async def reset_knowledge(request: Request):
    return await secure_reset_knowledge(request, km)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            user_text = data.get("text")
            user_audio = data.get("audio")

            if user_text:
                print(f"\U0001F535 Texto recibido: {user_text}")
                try:
                    # Obtener el contexto del conocimiento
                    context = km.get_knowledge()
                    system_prompt = f"Eres {context['rol']}. Usa el siguiente conocimiento para responder: {context['conocimientos']}"

                    # Generar respuesta con OpenAI LLM
                    respuesta = await generate_response_with_knowledge(system_prompt, user_text)

                    # Convertir respuesta a voz
                    tts_response = await tts.synthesize_speech(respuesta)
                    audio_data = await tts_response.aread()

                    if audio_data:
                        await websocket.send_bytes(audio_data)
                        await websocket.send_text("[✔] Audio generado y enviado correctamente.")
                        await send_to_n8n(user_text)
                    else:
                        print("[⚠️] Audio vacío generado por TTS.")
                        await websocket.send_text("[ERROR] Audio generado está vacío.")

                except Exception as e:
                    error_msg = f"[❌] Error generando audio: {str(e)}"
                    print(error_msg)
                    await websocket.send_text(error_msg)

            elif user_audio:
                # Futuro: reconocimiento de audio
                pass

    except WebSocketDisconnect:
        print("🔌 Cliente desconectado")
        await websocket.send_text("[INFO] Cliente desconectado del WebSocket.")
        manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=True)
