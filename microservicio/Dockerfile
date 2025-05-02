FROM python:3.11-slim

WORKDIR /app

# Copiar tu archivo principal
COPY app.py /app

# Instalar las dependencias, especificando versión compatible de OpenAI
RUN pip install fastapi websockets uvicorn openai==1.17.0 python-multipart

EXPOSE 3001

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "3001"]
