package com.agrostock.dto;

public record BatchCreate(
    String name,
    String paddock_id,
    String category_id,
    Integer head_count,
    Double average_weight_kg
) {}
