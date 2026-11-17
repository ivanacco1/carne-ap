package com.agrostock.dto;

public record BatchMovementRequest(
    String batch_id,
    String movement_type,
    Integer quantity,
    String destination_paddock_id,
    String destination_category_id,
    String cause_reason,
    String notes
) {}
