package com.agrostock.service;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

@Service
public class ReportService {

    private final JdbcClient jdbcClient;

    public ReportService(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    /**
     * Genera un archivo CSV con formato compatible con Excel (delimitador punto y coma y BOM UTF-8)
     * conteniendo la Planilla Oficial de Existencias Ganaderas.
     */
    public String generateStockCsv() {
        StringBuilder sb = new StringBuilder();

        // Byte Order Mark (BOM) UTF-8 para que Microsoft Excel abra los acentos perfectamente
        sb.append('\uFEFF');

        String fechaActual = LocalDate.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy"));

        // Encabezado del Informe
        sb.append("PLANILLA OFICIAL DE EXISTENCIAS GANADERAS - ESTANCIA SANTA MARÍA\n");
        sb.append("Fecha de emisión:;").append(fechaActual).append("\n");
        sb.append("Generado por:;Sistema AgroStock Ganadero\n\n");

        // Columnas de la tabla
        sb.append("Categoría;Lote / Tropa;Potrero Actual;Cabezas;Peso Prom. (kg);Kilos Totales Estimados;Estado\n");

        List<Map<String, Object>> batches = jdbcClient.sql("""
            SELECT 
                lb.name as batch_name,
                lb.head_count,
                COALESCE(lb.average_weight_kg, 0.0) as average_weight_kg,
                lc.name as category_name,
                p.name as paddock_name
            FROM livestock_batches lb
            JOIN livestock_categories lc ON lb.category_id = lc.id
            JOIN paddocks p ON lb.paddock_id = p.id
            ORDER BY lc.name ASC, lb.name ASC
        """).query().listOfRows();

        long totalCabezas = 0;
        double totalKilos = 0.0;

        for (Map<String, Object> b : batches) {
            String categoria = (String) b.get("category_name");
            String lote = (String) b.get("batch_name");
            String potrero = (String) b.get("paddock_name");
            long cabezas = ((Number) b.get("head_count")).longValue();
            double peso = ((Number) b.get("average_weight_kg")).doubleValue();
            double kilosTotales = cabezas * peso;

            totalCabezas += cabezas;
            totalKilos += kilosTotales;

            sb.append('"').append(categoria).append("\";")
              .append('"').append(lote).append("\";")
              .append('"').append(potrero).append("\";")
              .append(cabezas).append(";")
              .append(String.format("%.1f", peso)).append(";")
              .append(String.format("%.1f", kilosTotales)).append(";")
              .append("En campo\n");
        }

        // Fila de Totales Generales
        sb.append("\n");
        sb.append("TOTAL GENERAL;;;").append(totalCabezas).append(";;")
          .append(String.format("%.1f", totalKilos)).append(";\n");

        // Sección adicional: Resumen por Potrero
        sb.append("\n\nDISTRIBUCIÓN DE HACIENDA POR POTRERO\n");
        sb.append("Potrero;Superficie (ha);Cabezas;Carga Animal (cab/ha);Estado\n");

        List<Map<String, Object>> paddocks = jdbcClient.sql("""
            SELECT 
                p.name, p.hectares, p.status,
                COALESCE(SUM(lb.head_count), 0) as total_heads
            FROM paddocks p
            LEFT JOIN livestock_batches lb ON p.id = lb.paddock_id
            GROUP BY p.id
            ORDER BY p.name ASC
        """).query().listOfRows();

        for (Map<String, Object> p : paddocks) {
            String name = (String) p.get("name");
            double ha = ((Number) p.get("hectares")).doubleValue();
            long heads = ((Number) p.get("total_heads")).longValue();
            double rate = ha > 0 ? Math.round((heads / ha) * 100.0) / 100.0 : 0.0;
            String status = (String) p.get("status");

            sb.append('"').append(name).append("\";")
              .append(String.format("%.1f", ha)).append(";")
              .append(heads).append(";")
              .append(String.format("%.2f", rate)).append(";")
              .append(status).append("\n");
        }

        return sb.toString();
    }
}
