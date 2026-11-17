from typing import Optional
from pydantic import BaseModel, Field

class SupplyMovementRequest(BaseModel):
    supply_id: str
    warehouse_id: str
    movement_type: str  # 'ingreso_compra', 'consumo_animal', 'merma_vencimiento'
    quantity: float = Field(..., gt=0)
    batch_code: Optional[str] = None
    expiration_date: Optional[str] = None
    reference_invoice: Optional[str] = None
    notes: Optional[str] = None
