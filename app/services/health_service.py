import uuid
from datetime import datetime, timedelta
from fastapi import HTTPException
from app.database import get_connection
from app.schemas.health import HealthEventCreate

def get_all_health_events():
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT 
            he.*,
            lb.name as batch_name,
            s.name as supply_name,
            s.unit_of_measure,
            s.withdrawal_days
        FROM health_events he
        JOIN livestock_batches lb ON he.batch_id = lb.id
        JOIN supplies s ON he.supply_id = s.id
        ORDER BY he.application_date DESC, he.created_at DESC
    """)
    events = []
    today = datetime.now().date()
    for r in c.fetchall():
        ev = dict(r)
        if ev["withdrawal_end_date"]:
            end_d = datetime.strptime(ev["withdrawal_end_date"], "%Y-%m-%d").date()
            diff = (end_d - today).days
            ev["is_active_withdrawal"] = diff >= 0
            ev["days_left"] = max(0, diff)
        else:
            ev["is_active_withdrawal"] = False
            ev["days_left"] = 0
        events.append(ev)

    conn.close()
    return events

def record_new_treatment(he: HealthEventCreate):
    conn = get_connection()
    c = conn.cursor()

    # 1. Obtener datos del medicamento
    c.execute("SELECT name, withdrawal_days, unit_of_measure FROM supplies WHERE id = ?", (he.supply_id,))
    supply = c.fetchone()
    if not supply:
        conn.close()
        raise HTTPException(status_code=404, detail="Medicamento no encontrado")

    # 2. Calcular consumo y fecha fin de carencia
    total_consumed = round(he.heads_treated * he.dose_per_head, 2)
    app_date = datetime.now()
    withdrawal_days = supply["withdrawal_days"] or 0
    end_date = (app_date + timedelta(days=withdrawal_days)).strftime("%Y-%m-%d")

    # 3. Descontar stock del galpón
    if he.warehouse_id:
        c.execute("""
            SELECT id, current_quantity FROM supply_stocks
            WHERE warehouse_id = ? AND supply_id = ?
        """, (he.warehouse_id, he.supply_id))
        st = c.fetchone()
        if st and st["current_quantity"] >= total_consumed:
            c.execute("""
                UPDATE supply_stocks SET current_quantity = current_quantity - ? WHERE id = ?
            """, (total_consumed, st["id"]))
            
            c.execute("""
                INSERT INTO supply_movements (id, warehouse_id, supply_id, movement_type, quantity, notes)
                VALUES (?, ?, ?, 'consumo_animal', ?, ?)
            """, (str(uuid.uuid4()), he.warehouse_id, he.supply_id, -total_consumed, "Aplicación sanitaria a lote"))

    # 4. Registrar evento de sanidad
    event_id = str(uuid.uuid4())
    c.execute("""
        INSERT INTO health_events (
            id, batch_id, supply_id, heads_treated, dose_per_head, total_consumed,
            application_date, withdrawal_end_date, operator_name, notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        event_id, he.batch_id, he.supply_id, he.heads_treated, he.dose_per_head,
        total_consumed, app_date.strftime("%Y-%m-%d"), end_date, he.operator_name, he.notes
    ))

    conn.commit()
    conn.close()
    return {
        "id": event_id,
        "status": "success",
        "total_consumed": total_consumed,
        "withdrawal_end_date": end_date,
        "days_of_withdrawal": withdrawal_days
    }
