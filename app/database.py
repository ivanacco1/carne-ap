import sqlite3
from app.config import DB_PATH

def get_connection():
    """Retorna una conexión a SQLite optimizada para concurrencia con WAL y Claves Foráneas activas."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn

def init_db():
    """Crea las tablas de la base de datos si no existen aún."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.executescript("""
    -- 1. Establecimientos
    CREATE TABLE IF NOT EXISTS establishments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        location TEXT,
        total_hectares REAL,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- 2. Potreros
    CREATE TABLE IF NOT EXISTS paddocks (
        id TEXT PRIMARY KEY,
        establishment_id TEXT NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        hectares REAL NOT NULL,
        status TEXT DEFAULT 'en_uso',
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- 3. Galpones / Depósitos
    CREATE TABLE IF NOT EXISTS warehouses (
        id TEXT PRIMARY KEY,
        establishment_id TEXT NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- 4. Categorías de Ganado
    CREATE TABLE IF NOT EXISTS livestock_categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        target_gender TEXT NOT NULL,
        average_weight_kg REAL
    );

    -- 5. Lotes / Tropas de Ganado
    CREATE TABLE IF NOT EXISTS livestock_batches (
        id TEXT PRIMARY KEY,
        paddock_id TEXT NOT NULL REFERENCES paddocks(id),
        category_id TEXT NOT NULL REFERENCES livestock_categories(id),
        name TEXT NOT NULL,
        head_count INTEGER NOT NULL CHECK (head_count >= 0),
        average_weight_kg REAL,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- 6. Historial de Movimientos de Ganado
    CREATE TABLE IF NOT EXISTS livestock_movements (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL REFERENCES livestock_batches(id) ON DELETE CASCADE,
        movement_type TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        origin_paddock_id TEXT REFERENCES paddocks(id),
        destination_paddock_id TEXT REFERENCES paddocks(id),
        cause_reason TEXT,
        movement_date TEXT DEFAULT (date('now', 'localtime')),
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- 7. Catálogo de Insumos (Farmacia y Alimento)
    CREATE TABLE IF NOT EXISTS supplies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        supply_type TEXT NOT NULL,
        unit_of_measure TEXT NOT NULL,
        min_stock_alert REAL DEFAULT 0,
        withdrawal_days INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- 8. Stock físico por Depósito
    CREATE TABLE IF NOT EXISTS supply_stocks (
        id TEXT PRIMARY KEY,
        warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
        supply_id TEXT NOT NULL REFERENCES supplies(id) ON DELETE CASCADE,
        batch_code TEXT,
        expiration_date TEXT,
        current_quantity REAL NOT NULL DEFAULT 0 CHECK (current_quantity >= 0),
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- 9. Movimientos de Insumos
    CREATE TABLE IF NOT EXISTS supply_movements (
        id TEXT PRIMARY KEY,
        warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
        supply_id TEXT NOT NULL REFERENCES supplies(id),
        movement_type TEXT NOT NULL,
        quantity REAL NOT NULL,
        movement_date TEXT DEFAULT (date('now', 'localtime')),
        reference_invoice TEXT,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- 10. Eventos Sanitarios
    CREATE TABLE IF NOT EXISTS health_events (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL REFERENCES livestock_batches(id) ON DELETE CASCADE,
        supply_id TEXT NOT NULL REFERENCES supplies(id),
        heads_treated INTEGER NOT NULL,
        dose_per_head REAL NOT NULL,
        total_consumed REAL NOT NULL,
        application_date TEXT DEFAULT (date('now', 'localtime')),
        withdrawal_end_date TEXT,
        operator_name TEXT,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
    """)

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Base de datos inicializada en:", DB_PATH)
