FROM python:3.11-slim

# Establecer directorio de trabajo
WORKDIR /app

# Copiar los archivos del proyecto
COPY . /app

# Instalar dependencias desde requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Exponer el puerto del servicio
EXPOSE 3001

# Comando de inicio de FastAPI usando uvicorn
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "3001"]
