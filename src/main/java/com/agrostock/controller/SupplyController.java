package com.agrostock.controller;

import com.agrostock.dto.SupplyMovementRequest;
import com.agrostock.service.SupplyService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/supplies")
public class SupplyController {

    private final SupplyService supplyService;

    public SupplyController(SupplyService supplyService) {
        this.supplyService = supplyService;
    }

    @GetMapping
    public List<Map<String, Object>> getSupplies() {
        return supplyService.getAllSuppliesWithStock();
    }

    @PostMapping("/movement")
    public Map<String, Object> recordMovement(@RequestBody SupplyMovementRequest m) {
        return supplyService.recordSupplyMovement(m);
    }
}
