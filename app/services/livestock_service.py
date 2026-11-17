import uuid
from fastapi import HTTPException
from app.database import get_connection
from app.schemas.livestock import PaddockCreate, BatchCreate, QuickCounterUpdate, BatchMovementRequest

def get_all_batches():
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT 
            lb.id, lb.name, lb.head_count, lb.average_weight_kg, lb.updated_at,
            p.id as paddock_id, p.name as paddock_name,
            lc.id as category_id, lc.name as category_name, lc.target_gender
        FROM livestock_batches lb
        JOIN paddocks p ON lb.paddock_id = p.id
        JOIN livestock_categories lc ON lb.category_id = lc.id
        ORDER BY p.name ASC, lb.name ASC
    """)
    batches = [dict(r) for r in c.fetchall()]
    conn.close()
    return batches

def create_new_batch(b: BatchCreate):
    conn = get_connection()
    c = conn.cursor()
    new_id = str(uuid.uuid4())
    c.execute("""
        INSERT INTO livestock_batches (id, paddock_id, category_id, name, head_count, average_weight_kg)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (new_id, b.paddock_id, b.category_id, b.name, b.head_count, b.average_weight_kg))

    # Registrar alta en auditoría
    c.execute("""
        INSERT INTO livestock_movements (id, batch_id, movement_type, quantity, destination_paddock_id, notes)
        VALUES (?, ?, 'ingreso_compra', ?, ?, 'Alta manual de nuevo lote')
    """, (str(uuid.uuid4()), new_id, b.head_count, b.paddock_id))

    conn.commit()
    conn.close()
    return {"id": new_id, "status": "success"}

def update_quick_counter(q: QuickCounterUpdate):
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT head_count, paddock_id FROM livestock_batches WHERE id = ?", (q.batch_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Lote no encontrado")

    current_count = row["head_count"]
    new_count = current_count + q.delta
    if new_count < 0:
        conn.close()
        raise HTTPException(status_code=400, detail="El conteo de cabezas no puede ser negativo")

    c.execute("""
        UPDATE livestock_batches 
        SET head_count = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
    """, (new_count, q.batch_id))

    # Auditoría
    c.execute("""
        INSERT INTO livestock_movements (
            id, batch_id, movement_type, quantity, destination_paddock_id, cause_reason, notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        str(uuid.uuid4()), q.batch_id, q.action_type, q.delta, 
        row["paddock_id"], q.cause_reason, q.notes or f"Ajuste de Manga ({q.delta:+d})"
    ))

    conn.commit()
    conn.close()
    return {"batch_id": q.batch_id, "new_count": new_count}

def process_batch_movement(m: BatchMovementRequest):
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT head_count, paddock_id, category_id, name FROM livestock_batches WHERE id = ?", (m.batch_id,))
    batch = c.fetchone()
    if not batch:
        conn.close()
        raise HTTPException(status_code=404, detail="Lote no encontrado")

    if m.quantity <= 0:
        conn.close()
        raise HTTPException(status_code=400, detail="La cantidad debe ser mayor a 0")

    if m.movement_type in ['muerte', 'venta', 'consumo_interno']:
        if m.quantity > batch["head_count"]:
            conn.close()
            raise HTTPException(status_code=400, detail="No puedes dar de baja más animales de los que hay en el lote")
        
        new_count = batch["head_count"] - m.quantity
        c.execute("UPDATE livestock_batches SET head_count = ? WHERE id = ?", (new_count, m.batch_id))
        
        c.execute("""
            INSERT INTO livestock_movements (id, batch_id, movement_type, quantity, origin_paddock_id, cause_reason, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (str(uuid.uuid4()), m.batch_id, m.movement_type, -m.quantity, batch["paddock_id"], m.cause_reason, m.notes))

    elif m.movement_type == 'nacimiento':
        new_count = batch["head_count"] + m.quantity
        c.execute("UPDATE livestock_batches SET head_count = ? WHERE id = ?", (new_count, m.batch_id))
        
        c.execute("""
            INSERT INTO livestock_movements (id, batch_id, movement_type, quantity, destination_paddock_id, notes)
            VALUES (?, ?, 'nacimiento', ?, ?, ?)
        """, (str(uuid.uuid4()), m.batch_id, m.quantity, batch["paddock_id"], m.notes or "Nacimientos registrados"))

    elif m.movement_type == 'traslado_potrero':
        if not m.destination_paddock_id:
            conn.close()
            raise HTTPException(status_code=400, detail="Debe indicar el potrero de destino")
        
        if m.quantity >= batch["head_count"]:
            c.execute("UPDATE livestock_batches SET paddock_id = ? WHERE id = ?", (m.destination_paddock_id, m.batch_id))
        else:
            c.execute("UPDATE livestock_batches SET head_count = head_count - ? WHERE id = ?", (m.quantity, m.batch_id))
            sub_id = str(uuid.uuid4())
            c.execute("""
                INSERT INTO livestock_batches (id, paddock_id, category_id, name, head_count, average_weight_kg)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (sub_id, m.destination_paddock_id, batch["category_id"], f"{batch['name']} (Fracción)", m.quantity, 0))

        c.execute("""
            INSERT INTO livestock_movements (id, batch_id, movement_type, quantity, origin_paddock_id, destination_paddock_id, notes)
            VALUES (?, ?, 'traslado_potrero', ?, ?, ?, ?)
        """, (str(uuid.uuid4()), m.batch_id, m.quantity, batch["paddock_id"], m.destination_paddock_id, m.notes))

    elif m.movement_type == 'cambio_categoria':
        if not m.destination_category_id:
            conn.close()
            raise HTTPException(status_code=400, detail="Debe indicar la nueva categoría")
        
        c.execute("UPDATE livestock_batches SET category_id = ? WHERE id = ?", (m.destination_category_id, m.batch_id))
        c.execute("""
            INSERT INTO livestock_movements (id, batch_id, movement_type, quantity, notes)
            VALUES (?, ?, 'cambio_categoria', ?, ?)
        """, (str(uuid.uuid4()), m.batch_id, m.quantity, m.notes or "Reclasificación biológica"))

    conn.commit()
    conn.close()
    return {"status": "success", "message": "Movimiento registrado correctamente"}

def get_all_paddocks():
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT 
            p.*,
            COALESCE(SUM(lb.head_count), 0) as total_heads
        FROM paddocks p
        LEFT JOIN livestock_batches lb ON p.id = lb.paddock_id
        GROUP BY p.id
        ORDER BY p.name ASC
    """)
    paddocks = [dict(r) for r in c.fetchall()]
    conn.close()
    return paddocks

def create_new_paddock(p: PaddockCreate):
    conn = get_connection()
    c = conn.cursor()
    
    est_id = p.establishment_id
    if not est_id:
        c.execute("SELECT id FROM establishments LIMIT 1")
        row = c.fetchone()
        est_id = row[0] if row else str(uuid.uuid4())

    new_id = str(uuid.uuid4())
    c.execute("""
        INSERT INTO paddocks (id, establishment_id, name, hectares)
        VALUES (?, ?, ?, ?)
    """, (new_id, est_id, p.name, p.hectares))
    conn.commit()
    conn.close()
    return {"id": new_id, "status": "success"}

def get_all_categories():
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM livestock_categories ORDER BY name ASC")
    cats = [dict(r) for r in c.fetchall()]
    conn.close()
    return cats

def get_all_warehouses():
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM warehouses ORDER BY name ASC")
    warehouses = [dict(r) for r in c.fetchall()]
    conn.close()
    return warehouses

def get_history_movements(limit: int = 50):
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT 
            lm.id, lm.movement_type, lm.quantity, lm.movement_date, lm.cause_reason, lm.notes,
            lb.name as batch_name,
            po.name as origin_paddock,
            pd.name as destination_paddock
        FROM livestock_movements lm
        JOIN livestock_batches lb ON lm.batch_id = lb.id
        LEFT JOIN paddocks po ON lm.origin_paddock_id = po.id
        LEFT JOIN paddocks pd ON lm.destination_paddock_id = pd.id
        ORDER BY lm.created_at DESC
        LIMIT ?
    """, (limit,))
    movements = [dict(r) for r in c.fetchall()]
    conn.close()
    return movements
