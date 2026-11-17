package com.agrostock.dto;

public record QuickCounterUpdate(
    String batch_id,
    Integer delta,
    String action_type,
    String cause_reason,
    String notes
) {}
