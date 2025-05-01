import sqlite3
import os

DB_PATH = "/app/data/knowledge.db"

class KnowledgeManager:
    def __init__(self):
        os.makedirs("/app/data", exist_ok=True)
        self._init_db()

    def _init_db(self):
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS knowledge (id INTEGER PRIMARY KEY, rol TEXT, conocimientos TEXT)''')
        conn.commit()
        conn.close()

    def get_knowledge(self):
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('SELECT rol, conocimientos FROM knowledge WHERE id=1')
        row = c.fetchone()
        conn.close()
        return {"rol": row[0] if row else "", "conocimientos": row[1] if row else ""}

    def update_knowledge(self, data):
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('DELETE FROM knowledge WHERE id=1')
        c.execute(
            'INSERT INTO knowledge (id, rol, conocimientos) VALUES (1, ?, ?)',
            (
                data.get('rol_actual', '').strip(),
                data.get('nuevo_conocimiento', '').strip()
            )
        )
        conn.commit()
        conn.close()
        return {"message": "Knowledge updated"}

    def reset_knowledge(self):
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('DELETE FROM knowledge')
        conn.commit()
        conn.close()
        return {"message": "Knowledge reset"}

# ---- Rutas seguras para FastAPI (debes importar esto desde main.py) ----
from fastapi import Request, HTTPException

async def secure_update_knowledge(request: Request, km: KnowledgeManager):
    data = await request.json()
    user = data.get("usuario")
    password = data.get("clave")

    if user != os.getenv("KNOWLEDGE_USER") or password != os.getenv("KNOWLEDGE_PASSWORD"):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    return km.update_knowledge(data)

async def secure_reset_knowledge(request: Request, km: KnowledgeManager):
    data = await request.json()
    user = data.get("usuario")
    password = data.get("clave")

    if user != os.getenv("KNOWLEDGE_USER") or password != os.getenv("KNOWLEDGE_PASSWORD"):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    return km.reset_knowledge()
