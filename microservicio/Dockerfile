FROM python:3.11-slim

WORKDIR /app
COPY app.py /app

RUN pip install fastapi websockets uvicorn

EXPOSE 3001
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "3001"]
