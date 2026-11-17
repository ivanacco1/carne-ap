package com.agrostock.service;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
public class SummaryService {

    private final JdbcClient jdbcClient;

    public SummaryService(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    public Map<String, Object> calculateSummary() {
        // 1. Total cabezas
        Integer totalHeads = jdbcClient.sql("SELECT COALESCE(SUM(head_count), 0) FROM livestock_batches")
                .query(Integer.class)
                .single();

        // 2. Potreros y hectáreas
        Map<String, Object> paddockStats = jdbcClient.sql("SELECT COUNT(*) as total_paddocks, COALESCE(SUM(hectares), 0.0) as total_hectares FROM paddocks")
                .query()
                .singleRow();
        
        long totalPaddocks = ((Number) paddockStats.get("total_paddocks")).longValue();
        double totalHectares = ((Number) paddockStats.get("total_hectares")).doubleValue();
        double stockingRate = totalHectares > 0 ? Math.round((totalHeads / totalHectares) * 100.0) / 100.0 : 0.0;

        // 3. Distribución por Categoría
        List<Map<String, Object>> categories = jdbcClient.sql("""
            SELECT lc.name, COALESCE(SUM(lb.head_count), 0) as heads
            FROM livestock_categories lc
            LEFT JOIN livestock_batches lb ON lc.id = lb.category_id
            GROUP BY lc.id, lc.name
            HAVING heads > 0
            ORDER BY heads DESC
        """).query().listOfRows();

        // 4. Potreros individuales
        List<Map<String, Object>> rawPaddocks = jdbcClient.sql("""
            SELECT 
                p.id, p.name, p.hectares, p.status,
                COALESCE(SUM(lb.head_count), 0) as total_heads
            FROM paddocks p
            LEFT JOIN livestock_batches lb ON p.id = lb.paddock_id
            GROUP BY p.id
            ORDER BY p.name ASC
        """).query().listOfRows();

        List<Map<String, Object>> paddocks = new ArrayList<>();
        for (Map<String, Object> r : rawPaddocks) {
            Map<String, Object> p = new HashMap<>(r);
            double ha = ((Number) r.get("hectares")).doubleValue();
            long heads = ((Number) r.get("total_heads")).longValue();
            double rate = ha > 0 ? Math.round((heads / ha) * 100.0) / 100.0 : 0.0;
            p.put("stocking_rate", rate);
            paddocks.add(p);
        }

        // 5. Insumos con stock bajo
        List<Map<String, Object>> criticalSupplies = jdbcClient.sql("""
            SELECT 
                s.id, s.name, s.unit_of_measure as unit, s.min_stock_alert as min_alert, s.supply_type as type,
                COALESCE(SUM(ss.current_quantity), 0.0) as current_stock
            FROM supplies s
            LEFT JOIN supply_stocks ss ON s.id = ss.supply_id
            GROUP BY s.id
            HAVING current_stock <= s.min_stock_alert
            ORDER BY current_stock ASC
        """).query().listOfRows();

        // 6. Alertas sanitarias de carencia activa
        String todayStr = LocalDate.now().toString();
        List<Map<String, Object>> rawWithdrawals = jdbcClient.sql("""
            SELECT 
                he.id, he.application_date, he.withdrawal_end_date, he.heads_treated,
                lb.name as batch_name, p.name as paddock_name, s.name as medicine_name
            FROM health_events he
            JOIN livestock_batches lb ON he.batch_id = lb.id
            JOIN paddocks p ON lb.paddock_id = p.id
            JOIN supplies s ON he.supply_id = s.id
            WHERE he.withdrawal_end_date >= ?
            ORDER BY he.withdrawal_end_date ASC
        """).param(todayStr).query().listOfRows();

        LocalDate today = LocalDate.now();
        List<Map<String, Object>> activeWithdrawals = new ArrayList<>();
        for (Map<String, Object> rw : rawWithdrawals) {
            Map<String, Object> w = new HashMap<>(rw);
            String endDateStr = (String) rw.get("withdrawal_end_date");
            LocalDate endDate = LocalDate.parse(endDateStr);
            long daysLeft = ChronoUnit.DAYS.between(today, endDate) + 1;
            w.put("days_left", Math.max(0, daysLeft));
            activeWithdrawals.add(w);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total_heads", totalHeads);
        result.put("total_paddocks", totalPaddocks);
        result.put("total_hectares", totalHectares);
        result.put("stocking_rate", stockingRate);
        result.put("categories", categories);
        result.put("paddocks", paddocks);
        result.put("critical_supplies", criticalSupplies);
        result.put("active_withdrawals", activeWithdrawals);

        return result;
    }
}
