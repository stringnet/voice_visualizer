FROM python:3.11-slim

WORKDIR /app

# Copiar código fuente de la app
COPY ./app /app

# Copiar también el requirements.txt que está afuera de /app
COPY ./requirements.txt /app/requirements.txt

# (opcional) copiar env de ejemplo o real
# COPY .env /app/.env

RUN pip install --upgrade pip setuptools wheel
RUN pip install --no-cache-dir -r /app/requirements.txt

# Hacer que Python pueda encontrar submódulos como `utils`
ENV PYTHONPATH=/app

EXPOSE 5000

CMD ["gunicorn", "main:app", "--workers=1", "--worker-class=uvicorn.workers.UvicornWorker", "--bind=0.0.0.0:5000"]
