package com.agrostock.service;

import com.agrostock.dto.HealthEventCreate;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
public class HealthService {

    private final JdbcClient jdbcClient;

    public HealthService(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    public List<Map<String, Object>> getAllHealthEvents() {
        List<Map<String, Object>> rows = jdbcClient.sql("""
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
        """).query().listOfRows();

        LocalDate today = LocalDate.now();
        List<Map<String, Object>> result = new ArrayList<>();

        for (Map<String, Object> r : rows) {
            Map<String, Object> ev = new HashMap<>(r);
            String endDateStr = (String) ev.get("withdrawal_end_date");
            if (endDateStr != null && !endDateStr.isBlank()) {
                LocalDate endDate = LocalDate.parse(endDateStr);
                long diff = ChronoUnit.DAYS.between(today, endDate);
                ev.put("is_active_withdrawal", diff >= 0);
                ev.put("days_left", Math.max(0, diff));
            } else {
                ev.put("is_active_withdrawal", false);
                ev.put("days_left", 0);
            }
            result.add(ev);
        }

        return result;
    }

    public Map<String, Object> recordTreatment(HealthEventCreate he) {
        Optional<Map<String, Object>> supplyOpt = jdbcClient.sql("SELECT name, withdrawal_days, unit_of_measure FROM supplies WHERE id = ?")
                .param(he.supply_id())
                .query()
                .listOfRows()
                .stream().findFirst();

        if (supplyOpt.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Medicamento no encontrado");
        }

        int withdrawalDays = supplyOpt.get().get("withdrawal_days") != null ? ((Number) supplyOpt.get().get("withdrawal_days")).intValue() : 0;
        double totalConsumed = Math.round(he.heads_treated() * he.dose_per_head() * 100.0) / 100.0;
        LocalDate appDate = LocalDate.now();
        String endDateStr = appDate.plusDays(withdrawalDays).toString();

        // Descontar del depósito si se especificó
        if (he.warehouse_id() != null && !he.warehouse_id().isBlank()) {
            Optional<Map<String, Object>> stockOpt = jdbcClient.sql("SELECT id, current_quantity FROM supply_stocks WHERE warehouse_id = ? AND supply_id = ?")
                    .params(he.warehouse_id(), he.supply_id())
                    .query()
                    .listOfRows()
                    .stream().findFirst();

            if (stockOpt.isPresent()) {
                double current = ((Number) stockOpt.get().get("current_quantity")).doubleValue();
                if (current >= totalConsumed) {
                    jdbcClient.sql("UPDATE supply_stocks SET current_quantity = ? WHERE id = ?")
                            .params(current - totalConsumed, stockOpt.get().get("id"))
                            .update();

                    jdbcClient.sql("""
                        INSERT INTO supply_movements (id, warehouse_id, supply_id, movement_type, quantity, notes)
                        VALUES (?, ?, ?, 'consumo_animal', ?, ?)
                    """).params(UUID.randomUUID().toString(), he.warehouse_id(), he.supply_id(), -totalConsumed, "Aplicación sanitaria a lote")
                        .update();
                }
            }
        }

        String eventId = UUID.randomUUID().toString();
        jdbcClient.sql("""
            INSERT INTO health_events (
                id, batch_id, supply_id, heads_treated, dose_per_head, total_consumed,
                application_date, withdrawal_end_date, operator_name, notes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """).params(
            eventId, he.batch_id(), he.supply_id(), he.heads_treated(), he.dose_per_head(),
            totalConsumed, appDate.toString(), endDateStr, he.operator_name(), he.notes()
        ).update();

        return Map.of(
            "id", eventId,
            "status", "success",
            "total_consumed", totalConsumed,
            "withdrawal_end_date", endDateStr,
            "days_of_withdrawal", withdrawalDays
        );
    }
}
