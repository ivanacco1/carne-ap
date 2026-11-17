from typing import Optional
from pydantic import BaseModel, Field

class PaddockCreate(BaseModel):
    establishment_id: Optional[str] = None
    name: str = Field(..., min_length=1, max_length=100)
    hectares: float = Field(..., gt=0)

class BatchCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    paddock_id: str
    category_id: str
    head_count: int = Field(..., ge=1)
    average_weight_kg: Optional[float] = 0.0

class QuickCounterUpdate(BaseModel):
    batch_id: str
    delta: int  # Positivo para sumar, negativo para restar
    action_type: str = "recuento_ajuste"  # 'nacimiento', 'muerte', 'recuento_ajuste'
    cause_reason: Optional[str] = None
    notes: Optional[str] = None

class BatchMovementRequest(BaseModel):
    batch_id: str
    movement_type: str  # 'traslado_potrero', 'muerte', 'nacimiento', 'venta', 'cambio_categoria'
    quantity: int = Field(..., ge=1)
    destination_paddock_id: Optional[str] = None
    destination_category_id: Optional[str] = None
    cause_reason: Optional[str] = None
    notes: Optional[str] = None
