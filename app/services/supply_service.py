import uuid
from fastapi import HTTPException
from app.database import get_connection
from app.schemas.supplies import SupplyMovementRequest

def get_all_supplies_with_stock():
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT 
            s.*,
            COALESCE(SUM(ss.current_quantity), 0) as total_stock
        FROM supplies s
        LEFT JOIN supply_stocks ss ON s.id = ss.supply_id
        GROUP BY s.id
        ORDER BY s.supply_type ASC, s.name ASC
    """)
    supplies = []
    for r in c.fetchall():
        item = dict(r)
        c.execute("""
            SELECT ss.*, w.name as warehouse_name
            FROM supply_stocks ss
            JOIN warehouses w ON ss.warehouse_id = w.id
            WHERE ss.supply_id = ?
        """, (item["id"],))
        item["stocks"] = [dict(sr) for sr in c.fetchall()]
        supplies.append(item)

    conn.close()
    return supplies

def record_supply_movement(m: SupplyMovementRequest):
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
        SELECT id, current_quantity 
        FROM supply_stocks 
        WHERE warehouse_id = ? AND supply_id = ?
    """, (m.warehouse_id, m.supply_id))
    stock_row = c.fetchone()

    if m.movement_type in ['consumo_animal', 'merma_vencimiento']:
        if not stock_row or stock_row["current_quantity"] < m.quantity:
            conn.close()
            raise HTTPException(status_code=400, detail="Stock insuficiente en el depósito")
        
        c.execute("""
            UPDATE supply_stocks 
            SET current_quantity = current_quantity - ?, updated_at = datetime('now', 'localtime')
            WHERE id = ?
        """, (m.quantity, stock_row["id"]))
        qty_change = -m.quantity
    else:
        # Ingreso / Compra
        if stock_row:
            c.execute("""
                UPDATE supply_stocks 
                SET current_quantity = current_quantity + ?, 
                    batch_code = COALESCE(?, batch_code),
                    expiration_date = COALESCE(?, expiration_date),
                    updated_at = datetime('now', 'localtime')
                WHERE id = ?
            """, (m.quantity, m.batch_code, m.expiration_date, stock_row["id"]))
        else:
            c.execute("""
                INSERT INTO supply_stocks (id, warehouse_id, supply_id, batch_code, expiration_date, current_quantity)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (str(uuid.uuid4()), m.warehouse_id, m.supply_id, m.batch_code, m.expiration_date, m.quantity))
        qty_change = m.quantity

    c.execute("""
        INSERT INTO supply_movements (id, warehouse_id, supply_id, movement_type, quantity, reference_invoice, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (str(uuid.uuid4()), m.warehouse_id, m.supply_id, m.movement_type, qty_change, m.reference_invoice, m.notes))

    conn.commit()
    conn.close()
    return {"status": "success"}
