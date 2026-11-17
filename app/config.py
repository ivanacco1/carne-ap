from pathlib import Path

# Rutas del Sistema
BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "ganaderia.db"
STATIC_DIR = BASE_DIR / "static"

# Metadatos de la Aplicación
APP_TITLE = "AgroStock Ganadero"
APP_DESCRIPTION = "Sistema Modular y Escalable de Gestión de Inventario Ganadero e Insumos"
APP_VERSION = "2.0.0"
