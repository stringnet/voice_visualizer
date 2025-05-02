FROM python:3.11-slim

WORKDIR /app

# Copiar tu archivo principal
COPY app.py /app

# Instalar todas las dependencias necesarias, incluyendo OpenAI
RUN pip install fastapi websockets uvicorn openai python-multipart

EXPOSE 3001

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "3001"]
