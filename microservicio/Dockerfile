FROM python:3.11-slim

WORKDIR /app

# Copiar los archivos necesarios
COPY app.py requirements.txt /app/

# Instalar las dependencias desde requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Exponer el puerto del microservicio
EXPOSE 3001

# Ejecutar el servidor con Uvicorn
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "3001"]
