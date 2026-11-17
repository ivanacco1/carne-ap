import uuid
from datetime import datetime, timedelta
from app.database import get_connection, init_db

def uid():
    return str(uuid.uuid4())

def seed_database():
    init_db()
    conn = get_connection()
    cursor = conn.cursor()

    # Check if already seeded
    cursor.execute("SELECT COUNT(*) FROM establishments")
    if cursor.fetchone()[0] > 0:
        print("Database already contains data. Skipping seed.")
        conn.close()
        return

    print("Seeding database with realistic livestock data...")

    # 1. Establecimiento
    est_id = uid()
    cursor.execute("""
        INSERT INTO establishments (id, name, location, total_hectares)
        VALUES (?, ?, ?, ?)
    """, (est_id, "Estancia Santa María", "Ruta Nac. 5 Km 240, Bs. As.", 1050.0))

    # 2. Potreros
    paddocks_data = [
        ("Potrero El Bajo", 350.0, "en_uso"),
        ("Potrero El Molino", 220.0, "en_uso"),
        ("Lote Norte", 380.0, "en_uso"),
        ("Corral de Encierre & Feedlot", 100.0, "en_uso"),
    ]
    paddock_ids = {}
    for name, ha, status in paddocks_data:
        p_id = uid()
        paddock_ids[name] = p_id
        cursor.execute("""
            INSERT INTO paddocks (id, establishment_id, name, hectares, status)
            VALUES (?, ?, ?, ?, ?)
        """, (p_id, est_id, name, ha, status))

    # 3. Depósitos
    warehouses_data = ["Galpón Principal de Insumos", "Tinglado Forrajero & Silos"]
    warehouse_ids = {}
    for wname in warehouses_data:
        w_id = uid()
        warehouse_ids[wname] = w_id
        cursor.execute("""
            INSERT INTO warehouses (id, establishment_id, name)
            VALUES (?, ?, ?)
        """, (w_id, est_id, wname))

    # 4. Categorías de Ganado
    categories_data = [
        ("Vaca de Cría", "hembra", 440.0),
        ("Vaquillona", "hembra", 320.0),
        ("Novillito", "macho", 280.0),
        ("Novillo", "macho", 420.0),
        ("Ternero", "macho", 160.0),
        ("Ternera", "hembra", 150.0),
        ("Toro", "macho", 750.0)
    ]
    category_ids = {}
    for cname, gender, weight in categories_data:
        c_id = uid()
        category_ids[cname] = c_id
        cursor.execute("""
            INSERT INTO livestock_categories (id, name, target_gender, average_weight_kg)
            VALUES (?, ?, ?, ?)
        """, (c_id, cname, gender, weight))

    # 5. Lotes / Tropas de Ganado
    batches_data = [
        ("Rodeo Vacas Aberdeen Angus", paddock_ids["Potrero El Bajo"], category_ids["Vaca de Cría"], 185, 450.0),
        ("Toros Reproductores Plantel", paddock_ids["Potrero El Molino"], category_ids["Toro"], 12, 780.0),
        ("Vaquillonas para Entore", paddock_ids["Potrero El Molino"], category_ids["Vaquillona"], 65, 335.0),
        ("Novillitos Invernada 2026", paddock_ids["Lote Norte"], category_ids["Novillito"], 140, 290.0),
        ("Terneros Destetados Lote A", paddock_ids["Corral de Encierre & Feedlot"], category_ids["Ternero"], 90, 175.0),
    ]
    batch_ids = {}
    for bname, pid, cid, count, weight in batches_data:
        b_id = uid()
        batch_ids[bname] = b_id
        cursor.execute("""
            INSERT INTO livestock_batches (id, paddock_id, category_id, name, head_count, average_weight_kg)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (b_id, pid, cid, bname, count, weight))

        # Registrar alta inicial en movimientos
        cursor.execute("""
            INSERT INTO livestock_movements (id, batch_id, movement_type, quantity, destination_paddock_id, notes)
            VALUES (?, ?, 'ingreso_compra', ?, ?, 'Inventario inicial del establecimiento')
        """, (uid(), b_id, count, pid))

    # 6. Catálogo de Insumos (Farmacia y Alimento)
    supplies_data = [
        # Insumo, Tipo, Unidad, Stock Min, Días Carencia
        ("Ivermectina 1% L.A. (500 ml)", "medicamento", "frascos", 5.0, 35),
        ("Vacuna Anticarbunclosa (50 dosis)", "vacuna", "frascos", 10.0, 21),
        ("Oxitetraciclina L.A. 200 (250 ml)", "medicamento", "frascos", 4.0, 28),
        ("Antiparasitario Ricobendazol 10%", "medicamento", "litros", 6.0, 14),
        ("Rollo de Alfalfa Primera Calidad", "alimento", "rollos", 20.0, 0),
        ("Maíz Grano Partido a Granel", "alimento", "kg", 5000.0, 0),
        ("Suplemento Mineral Bovina en Bloque", "alimento", "kg", 300.0, 0),
        ("Caravanas Visuales Oficiales", "accesorio", "unidades", 50.0, 0),
    ]
    supply_ids = {}
    for sname, stype, uom, min_alert, with_days in supplies_data:
        s_id = uid()
        supply_ids[sname] = s_id
        cursor.execute("""
            INSERT INTO supplies (id, name, supply_type, unit_of_measure, min_stock_alert, withdrawal_days)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (s_id, sname, stype, uom, min_alert, with_days))

    # 7. Stock Físico en Galpones
    stock_records = [
        (warehouse_ids["Galpón Principal de Insumos"], supply_ids["Ivermectina 1% L.A. (500 ml)"], "L-IV2401", "2027-08-30", 14.0),
        (warehouse_ids["Galpón Principal de Insumos"], supply_ids["Vacuna Anticarbunclosa (50 dosis)"], "L-AC8892", "2027-04-15", 18.0),
        (warehouse_ids["Galpón Principal de Insumos"], supply_ids["Oxitetraciclina L.A. 200 (250 ml)"], "L-OXI551", "2026-12-10", 3.0), # Alerta stock bajo
        (warehouse_ids["Galpón Principal de Insumos"], supply_ids["Antiparasitario Ricobendazol 10%"], "L-RB90", "2027-06-20", 25.0),
        (warehouse_ids["Galpón Principal de Insumos"], supply_ids["Caravanas Visuales Oficiales"], "L-CRV01", "2030-01-01", 120.0),
        (warehouse_ids["Tinglado Forrajero & Silos"], supply_ids["Rollo de Alfalfa Primera Calidad"], "L-ROL26", None, 45.0),
        (warehouse_ids["Tinglado Forrajero & Silos"], supply_ids["Maíz Grano Partido a Granel"], "L-MZ26", None, 18500.0),
        (warehouse_ids["Tinglado Forrajero & Silos"], supply_ids["Suplemento Mineral Bovina en Bloque"], "L-MIN04", "2028-02-01", 650.0),
    ]
    for wid, sid, bcode, exp, qty in stock_records:
        cursor.execute("""
            INSERT INTO supply_stocks (id, warehouse_id, supply_id, batch_code, expiration_date, current_quantity)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (uid(), wid, sid, bcode, exp, qty))

        cursor.execute("""
            INSERT INTO supply_movements (id, warehouse_id, supply_id, movement_type, quantity, reference_invoice, notes)
            VALUES (?, ?, ?, 'ingreso_compra', ?, 'REMITO-001', 'Ingreso inicial a galpón')
        """, (uid(), wid, sid, qty))

    # 8. Evento Sanitario activo con Carencia Activa (alerta visual)
    # Ejemplo: Vacunación hace 5 días con Oxitetraciclina a Novillitos (Carencia de 28 días)
    applied_date = (datetime.now() - timedelta(days=5)).strftime("%Y-%m-%d")
    end_date = (datetime.now() + timedelta(days=23)).strftime("%Y-%m-%d")
    
    cursor.execute("""
        INSERT INTO health_events (
            id, batch_id, supply_id, heads_treated, dose_per_head, total_consumed, 
            application_date, withdrawal_end_date, operator_name, notes
        )
        VALUES (?, ?, ?, 140, 5.0, 700.0, ?, ?, 'Juan Gómez (Veterinario)', 'Tratamiento preventivo respiratorio de entrada')
    """, (
        uid(), 
        batch_ids["Novillitos Invernada 2026"], 
        supply_ids["Oxitetraciclina L.A. 200 (250 ml)"],
        applied_date,
        end_date
    ))

    conn.commit()
    conn.close()
    print("Database successfully seeded with realistic sample data!")

if __name__ == "__main__":
    seed_database()
