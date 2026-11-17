from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.config import APP_TITLE, APP_DESCRIPTION, APP_VERSION, STATIC_DIR
from app.database import init_db
from app.routers import summary, livestock, supplies, health

# Inicialización de la aplicación FastAPI
app = FastAPI(
    title=APP_TITLE,
    description=APP_DESCRIPTION,
    version=APP_VERSION
)

@app.on_event("startup")
def startup():
    """Garantiza que la base de datos y sus tablas estén listas."""
    init_db()

# Registro de Enrutadores Modulares
app.include_router(summary.router)
app.include_router(livestock.router)
app.include_router(supplies.router)
app.include_router(health.router)

# Archivos Estáticos y Aplicación Web (PWA)
if not STATIC_DIR.exists():
    STATIC_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def serve_index():
    """Punto de entrada de la interfaz de usuario."""
    index_file = STATIC_DIR / "index.html"
    if not index_file.exists():
        return {"status": "Frontend not found"}
    return FileResponse(index_file)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
