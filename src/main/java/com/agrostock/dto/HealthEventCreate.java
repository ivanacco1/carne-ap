package com.agrostock.dto;

public record HealthEventCreate(
    String batch_id,
    String supply_id,
    Integer heads_treated,
    Double dose_per_head,
    String warehouse_id,
    String operator_name,
    String notes
) {}
