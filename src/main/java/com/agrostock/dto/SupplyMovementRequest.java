package com.agrostock.dto;

public record SupplyMovementRequest(
    String supply_id,
    String warehouse_id,
    String movement_type,
    Double quantity,
    String batch_code,
    String expiration_date,
    String reference_invoice,
    String notes
) {}
