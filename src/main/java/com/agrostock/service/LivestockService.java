package com.agrostock.service;

import com.agrostock.dto.BatchCreate;
import com.agrostock.dto.BatchMovementRequest;
import com.agrostock.dto.PaddockCreate;
import com.agrostock.dto.QuickCounterUpdate;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

@Service
public class LivestockService {

    private final JdbcClient jdbcClient;

    public LivestockService(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    public List<Map<String, Object>> getAllBatches() {
        return jdbcClient.sql("""
            SELECT 
                lb.id, lb.name, lb.head_count, lb.average_weight_kg, lb.updated_at,
                p.id as paddock_id, p.name as paddock_name,
                lc.id as category_id, lc.name as category_name, lc.target_gender
            FROM livestock_batches lb
            JOIN paddocks p ON lb.paddock_id = p.id
            JOIN livestock_categories lc ON lb.category_id = lc.id
            ORDER BY p.name ASC, lb.name ASC
        """).query().listOfRows();
    }

    public Map<String, Object> createBatch(BatchCreate b) {
        String newId = UUID.randomUUID().toString();
        jdbcClient.sql("""
            INSERT INTO livestock_batches (id, paddock_id, category_id, name, head_count, average_weight_kg)
            VALUES (?, ?, ?, ?, ?, ?)
        """).params(newId, b.paddock_id(), b.category_id(), b.name(), b.head_count(), b.average_weight_kg() != null ? b.average_weight_kg() : 0.0)
            .update();

        // Movimiento inicial en auditoría
        jdbcClient.sql("""
            INSERT INTO livestock_movements (id, batch_id, movement_type, quantity, destination_paddock_id, notes)
            VALUES (?, ?, 'ingreso_compra', ?, ?, 'Alta manual de nuevo lote')
        """).params(UUID.randomUUID().toString(), newId, b.head_count(), b.paddock_id())
            .update();

        return Map.of("id", newId, "status", "success");
    }

    public Map<String, Object> updateQuickCounter(QuickCounterUpdate q) {
        Optional<Map<String, Object>> batchOpt = jdbcClient.sql("SELECT head_count, paddock_id FROM livestock_batches WHERE id = ?")
                .param(q.batch_id())
                .query()
                .listOfRows()
                .stream().findFirst();

        if (batchOpt.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Lote no encontrado");
        }

        int currentCount = ((Number) batchOpt.get().get("head_count")).intValue();
        String paddockId = (String) batchOpt.get().get("paddock_id");
        int newCount = currentCount + q.delta();

        if (newCount < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El conteo de cabezas no puede ser negativo");
        }

        jdbcClient.sql("UPDATE livestock_batches SET head_count = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
                .params(newCount, q.batch_id())
                .update();

        String notes = q.notes() != null ? q.notes() : "Ajuste desde Modo Manga (" + (q.delta() > 0 ? "+" : "") + q.delta() + ")";
        jdbcClient.sql("""
            INSERT INTO livestock_movements (id, batch_id, movement_type, quantity, destination_paddock_id, cause_reason, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """).params(UUID.randomUUID().toString(), q.batch_id(), q.action_type(), q.delta(), paddockId, q.cause_reason(), notes)
            .update();

        return Map.of("batch_id", q.batch_id(), "new_count", newCount);
    }

    public Map<String, Object> processMovement(BatchMovementRequest m) {
        Optional<Map<String, Object>> batchOpt = jdbcClient.sql("SELECT head_count, paddock_id, category_id, name FROM livestock_batches WHERE id = ?")
                .param(m.batch_id())
                .query()
                .listOfRows()
                .stream().findFirst();

        if (batchOpt.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Lote no encontrado");
        }

        int currentCount = ((Number) batchOpt.get().get("head_count")).intValue();
        String currentPaddockId = (String) batchOpt.get().get("paddock_id");
        String categoryId = (String) batchOpt.get().get("category_id");
        String batchName = (String) batchOpt.get().get("name");

        if (m.quantity() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La cantidad debe ser mayor a 0");
        }

        if (List.of("muerte", "venta", "consumo_interno").contains(m.movement_type())) {
            if (m.quantity() > currentCount) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No puedes dar de baja más animales de los que hay en el lote");
            }
            int newCount = currentCount - m.quantity();
            jdbcClient.sql("UPDATE livestock_batches SET head_count = ? WHERE id = ?")
                    .params(newCount, m.batch_id())
                    .update();

            jdbcClient.sql("""
                INSERT INTO livestock_movements (id, batch_id, movement_type, quantity, origin_paddock_id, cause_reason, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """).params(UUID.randomUUID().toString(), m.batch_id(), m.movement_type(), -m.quantity(), currentPaddockId, m.cause_reason(), m.notes())
                .update();

        } else if ("nacimiento".equals(m.movement_type())) {
            int newCount = currentCount + m.quantity();
            jdbcClient.sql("UPDATE livestock_batches SET head_count = ? WHERE id = ?")
                    .params(newCount, m.batch_id())
                    .update();

            jdbcClient.sql("""
                INSERT INTO livestock_movements (id, batch_id, movement_type, quantity, destination_paddock_id, notes)
                VALUES (?, ?, 'nacimiento', ?, ?, ?)
            """).params(UUID.randomUUID().toString(), m.batch_id(), m.quantity(), currentPaddockId, m.notes() != null ? m.notes() : "Nacimientos registrados")
                .update();

        } else if ("traslado_potrero".equals(m.movement_type())) {
            if (m.destination_paddock_id() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Debe indicar el potrero de destino");
            }

            if (m.quantity() >= currentCount) {
                jdbcClient.sql("UPDATE livestock_batches SET paddock_id = ? WHERE id = ?")
                        .params(m.destination_paddock_id(), m.batch_id())
                        .update();
            } else {
                jdbcClient.sql("UPDATE livestock_batches SET head_count = head_count - ? WHERE id = ?")
                        .params(m.quantity(), m.batch_id())
                        .update();

                String subId = UUID.randomUUID().toString();
                jdbcClient.sql("""
                    INSERT INTO livestock_batches (id, paddock_id, category_id, name, head_count, average_weight_kg)
                    VALUES (?, ?, ?, ?, ?, ?)
                """).params(subId, m.destination_paddock_id(), categoryId, batchName + " (Fracción)", m.quantity(), 0.0)
                    .update();
            }

            jdbcClient.sql("""
                INSERT INTO livestock_movements (id, batch_id, movement_type, quantity, origin_paddock_id, destination_paddock_id, notes)
                VALUES (?, ?, 'traslado_potrero', ?, ?, ?, ?)
            """).params(UUID.randomUUID().toString(), m.batch_id(), m.quantity(), currentPaddockId, m.destination_paddock_id(), m.notes())
                .update();

        } else if ("cambio_categoria".equals(m.movement_type())) {
            if (m.destination_category_id() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Debe indicar la nueva categoría");
            }
            jdbcClient.sql("UPDATE livestock_batches SET category_id = ? WHERE id = ?")
                    .params(m.destination_category_id(), m.batch_id())
                    .update();

            jdbcClient.sql("""
                INSERT INTO livestock_movements (id, batch_id, movement_type, quantity, notes)
                VALUES (?, ?, 'cambio_categoria', ?, ?)
            """).params(UUID.randomUUID().toString(), m.batch_id(), m.quantity(), m.notes() != null ? m.notes() : "Reclasificación biológica")
                .update();
        }

        return Map.of("status", "success", "message", "Movimiento registrado correctamente");
    }

    public List<Map<String, Object>> getAllPaddocks() {
        return jdbcClient.sql("""
            SELECT p.*, COALESCE(SUM(lb.head_count), 0) as total_heads
            FROM paddocks p
            LEFT JOIN livestock_batches lb ON p.id = lb.paddock_id
            GROUP BY p.id
            ORDER BY p.name ASC
        """).query().listOfRows();
    }

    public Map<String, Object> createPaddock(PaddockCreate p) {
        String estId = p.establishment_id();
        if (estId == null) {
            Optional<String> firstEst = jdbcClient.sql("SELECT id FROM establishments LIMIT 1")
                    .query(String.class)
                    .optional();
            estId = firstEst.orElseGet(() -> UUID.randomUUID().toString());
        }

        String newId = UUID.randomUUID().toString();
        jdbcClient.sql("INSERT INTO paddocks (id, establishment_id, name, hectares) VALUES (?, ?, ?, ?)")
                .params(newId, estId, p.name(), p.hectares())
                .update();

        return Map.of("id", newId, "status", "success");
    }

    public List<Map<String, Object>> getAllCategories() {
        return jdbcClient.sql("SELECT * FROM livestock_categories ORDER BY name ASC").query().listOfRows();
    }

    public List<Map<String, Object>> getAllWarehouses() {
        return jdbcClient.sql("SELECT * FROM warehouses ORDER BY name ASC").query().listOfRows();
    }

    public List<Map<String, Object>> getHistoryMovements(int limit) {
        return jdbcClient.sql("""
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
        """).param(limit).query().listOfRows();
    }
}
