package com.agrostock.controller;

import com.agrostock.dto.BatchCreate;
import com.agrostock.dto.BatchMovementRequest;
import com.agrostock.dto.PaddockCreate;
import com.agrostock.dto.QuickCounterUpdate;
import com.agrostock.service.LivestockService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class LivestockController {

    private final LivestockService livestockService;

    public LivestockController(LivestockService livestockService) {
        this.livestockService = livestockService;
    }

    // Lotes de Hacienda
    @GetMapping("/batches")
    public List<Map<String, Object>> getBatches() {
        return livestockService.getAllBatches();
    }

    @PostMapping("/batches")
    public Map<String, Object> createBatch(@RequestBody BatchCreate b) {
        return livestockService.createBatch(b);
    }

    @PostMapping("/batches/quick-counter")
    public Map<String, Object> quickCounter(@RequestBody QuickCounterUpdate q) {
        return livestockService.updateQuickCounter(q);
    }

    @PostMapping("/batches/move")
    public Map<String, Object> moveBatch(@RequestBody BatchMovementRequest m) {
        return livestockService.processMovement(m);
    }

    // Potreros y Ubicaciones
    @GetMapping("/paddocks")
    public List<Map<String, Object>> getPaddocks() {
        return livestockService.getAllPaddocks();
    }

    @PostMapping("/paddocks")
    public Map<String, Object> createPaddock(@RequestBody PaddockCreate p) {
        return livestockService.createPaddock(p);
    }

    // Catálogos Auxiliares
    @GetMapping("/categories")
    public List<Map<String, Object>> getCategories() {
        return livestockService.getAllCategories();
    }

    @GetMapping("/warehouses")
    public List<Map<String, Object>> getWarehouses() {
        return livestockService.getAllWarehouses();
    }

    // Auditoría
    @GetMapping("/history")
    public List<Map<String, Object>> getHistory() {
        return livestockService.getHistoryMovements(50);
    }
}
