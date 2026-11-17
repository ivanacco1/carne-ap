package com.agrostock.service;

import com.agrostock.dto.SupplyMovementRequest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

@Service
public class SupplyService {

    private final JdbcClient jdbcClient;

    public SupplyService(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    public List<Map<String, Object>> getAllSuppliesWithStock() {
        List<Map<String, Object>> supplies = jdbcClient.sql("""
            SELECT s.*, COALESCE(SUM(ss.current_quantity), 0.0) as total_stock
            FROM supplies s
            LEFT JOIN supply_stocks ss ON s.id = ss.supply_id
            GROUP BY s.id
            ORDER BY s.supply_type ASC, s.name ASC
        """).query().listOfRows();

        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> r : supplies) {
            Map<String, Object> item = new HashMap<>(r);
            List<Map<String, Object>> stocks = jdbcClient.sql("""
                SELECT ss.*, w.name as warehouse_name
                FROM supply_stocks ss
                JOIN warehouses w ON ss.warehouse_id = w.id
                WHERE ss.supply_id = ?
            """).param(item.get("id")).query().listOfRows();

            item.put("stocks", stocks);
            result.add(item);
        }

        return result;
    }

    public Map<String, Object> recordSupplyMovement(SupplyMovementRequest m) {
        Optional<Map<String, Object>> stockRow = jdbcClient.sql("""
            SELECT id, current_quantity 
            FROM supply_stocks 
            WHERE warehouse_id = ? AND supply_id = ?
        """).params(m.warehouse_id(), m.supply_id()).query().listOfRows().stream().findFirst();

        double qtyChange;

        if (List.of("consumo_animal", "merma_vencimiento").contains(m.movement_type())) {
            if (stockRow.isEmpty() || ((Number) stockRow.get().get("current_quantity")).doubleValue() < m.quantity()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Stock insuficiente en el depósito");
            }
            double current = ((Number) stockRow.get().get("current_quantity")).doubleValue();
            jdbcClient.sql("UPDATE supply_stocks SET current_quantity = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
                    .params(current - m.quantity(), stockRow.get().get("id"))
                    .update();
            qtyChange = -m.quantity();
        } else {
            // Ingreso / Compra
            if (stockRow.isPresent()) {
                double current = ((Number) stockRow.get().get("current_quantity")).doubleValue();
                jdbcClient.sql("""
                    UPDATE supply_stocks 
                    SET current_quantity = ?, 
                        batch_code = COALESCE(?, batch_code),
                        expiration_date = COALESCE(?, expiration_date),
                        updated_at = datetime('now', 'localtime')
                    WHERE id = ?
                """).params(current + m.quantity(), m.batch_code(), m.expiration_date(), stockRow.get().get("id"))
                    .update();
            } else {
                jdbcClient.sql("""
                    INSERT INTO supply_stocks (id, warehouse_id, supply_id, batch_code, expiration_date, current_quantity)
                    VALUES (?, ?, ?, ?, ?, ?)
                """).params(UUID.randomUUID().toString(), m.warehouse_id(), m.supply_id(), m.batch_code(), m.expiration_date(), m.quantity())
                    .update();
            }
            qtyChange = m.quantity();
        }

        jdbcClient.sql("""
            INSERT INTO supply_movements (id, warehouse_id, supply_id, movement_type, quantity, reference_invoice, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """).params(UUID.randomUUID().toString(), m.warehouse_id(), m.supply_id(), m.movement_type(), qtyChange, m.reference_invoice(), m.notes())
            .update();

        return Map.of("status", "success");
    }
}
