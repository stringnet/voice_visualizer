# app/utils/tts_openai.py corregido para OpenAI v1.17.0

from openai import AsyncOpenAI, OpenAIError
import os
import asyncio

class OpenAITTS:
    def __init__(self):
        # Inicializar cliente OpenAI async correctamente
        self.client = AsyncOpenAI(
            api_key=os.getenv("OPENAI_API_KEY")
        )

    async def synthesize_speech(self, text: str, model: str = "tts-1", voice: str = "nova", retries: int = 3):
        """Genera audio a partir de texto usando OpenAI TTS, con manejo de errores y reintentos."""
        attempt = 0
        while attempt < retries:
            try:
                response = await self.client.audio.speech.create(
                    model=model,
                    voice=voice,
                    input=text,
                    response_format="opus"
                )
                return response
            except OpenAIError as e:
                attempt += 1
                print(f"\u26a0\ufe0f Error en OpenAI TTS intento {attempt}: {e}")
                if attempt >= retries:
                    raise Exception(f"\u274c Fallo definitivo al sintetizar audio: {e}")
                await asyncio.sleep(2 * attempt)  # espera progresiva entre intentos
