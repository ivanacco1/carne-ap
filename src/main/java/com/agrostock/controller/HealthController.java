package com.agrostock.controller;

import com.agrostock.dto.HealthEventCreate;
import com.agrostock.service.HealthService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/health-events")
public class HealthController {

    private final HealthService healthService;

    public HealthController(HealthService healthService) {
        this.healthService = healthService;
    }

    @GetMapping
    public List<Map<String, Object>> getHealthEvents() {
        return healthService.getAllHealthEvents();
    }

    @PostMapping
    public Map<String, Object> createHealthEvent(@RequestBody HealthEventCreate he) {
        return healthService.recordTreatment(he);
    }
}
