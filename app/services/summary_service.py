from datetime import datetime
from app.database import get_connection

def calculate_dashboard_summary():
    """Calcula y consolida todas las métricas operativas del campo en un solo objeto."""
    conn = get_connection()
    c = conn.cursor()

    # 1. Total cabezas
    c.execute("SELECT COALESCE(SUM(head_count), 0) FROM livestock_batches")
    total_heads = c.fetchone()[0]

    # 2. Total hectáreas y potreros
    c.execute("SELECT COUNT(*), COALESCE(SUM(hectares), 0) FROM paddocks")
    row_pad = c.fetchone()
    total_paddocks = row_pad[0]
    total_hectares = row_pad[1]
    stocking_rate = round(total_heads / total_hectares, 2) if total_hectares > 0 else 0

    # 3. Distribución por Categoría
    c.execute("""
        SELECT lc.name, COALESCE(SUM(lb.head_count), 0) as total
        FROM livestock_categories lc
        LEFT JOIN livestock_batches lb ON lc.id = lb.category_id
        GROUP BY lc.id, lc.name
        ORDER BY total DESC
    """)
    category_distribution = [
        {"name": row["name"], "heads": row["total"]}
        for row in c.fetchall() if row["total"] > 0
    ]

    # 4. Potreros con su hacienda y carga animal individual
    c.execute("""
        SELECT 
            p.id, p.name, p.hectares, p.status,
            COALESCE(SUM(lb.head_count), 0) as total_heads
        FROM paddocks p
        LEFT JOIN livestock_batches lb ON p.id = lb.paddock_id
        GROUP BY p.id
        ORDER BY p.name ASC
    """)
    paddocks_summary = []
    for r in c.fetchall():
        heads = r["total_heads"]
        ha = r["hectares"]
        rate = round(heads / ha, 2) if ha > 0 else 0
        paddocks_summary.append({
            "id": r["id"],
            "name": r["name"],
            "hectares": ha,
            "status": r["status"],
            "total_heads": heads,
            "stocking_rate": rate
        })

    # 5. Insumos con stock bajo el punto de reposición
    c.execute("""
        SELECT 
            s.id, s.name, s.unit_of_measure, s.min_stock_alert, s.supply_type,
            COALESCE(SUM(ss.current_quantity), 0) as current_stock
        FROM supplies s
        LEFT JOIN supply_stocks ss ON s.id = ss.supply_id
        GROUP BY s.id
        HAVING current_stock <= s.min_stock_alert
        ORDER BY current_stock ASC
    """)
    critical_supplies = [
        {
            "id": r["id"],
            "name": r["name"],
            "unit": r["unit_of_measure"],
            "current_stock": r["current_stock"],
            "min_alert": r["min_stock_alert"],
            "type": r["supply_type"]
        }
        for r in c.fetchall()
    ]

    # 6. Alertas sanitarias de carencia activa (withdrawal period)
    today = datetime.now().strftime("%Y-%m-%d")
    c.execute("""
        SELECT 
            he.id, he.application_date, he.withdrawal_end_date, he.heads_treated,
            lb.name as batch_name, p.name as paddock_name, s.name as medicine_name
        FROM health_events he
        JOIN livestock_batches lb ON he.batch_id = lb.id
        JOIN paddocks p ON lb.paddock_id = p.id
        JOIN supplies s ON he.supply_id = s.id
        WHERE he.withdrawal_end_date >= ?
        ORDER BY he.withdrawal_end_date ASC
    """, (today,))
    
    active_withdrawals = []
    for r in c.fetchall():
        end_d = datetime.strptime(r["withdrawal_end_date"], "%Y-%m-%d")
        days_left = (end_d - datetime.now()).days + 1
        active_withdrawals.append({
            "id": r["id"],
            "batch_name": r["batch_name"],
            "paddock_name": r["paddock_name"],
            "medicine_name": r["medicine_name"],
            "heads_treated": r["heads_treated"],
            "application_date": r["application_date"],
            "withdrawal_end_date": r["withdrawal_end_date"],
            "days_left": max(0, days_left)
        })

    conn.close()

    return {
        "total_heads": total_heads,
        "total_paddocks": total_paddocks,
        "total_hectares": total_hectares,
        "stocking_rate": stocking_rate,
        "categories": category_distribution,
        "paddocks": paddocks_summary,
        "critical_supplies": critical_supplies,
        "active_withdrawals": active_withdrawals
    }
