from typing import Optional
from pydantic import BaseModel, Field

class HealthEventCreate(BaseModel):
    batch_id: str
    supply_id: str
    heads_treated: int = Field(..., ge=1)
    dose_per_head: float = Field(..., gt=0)
    warehouse_id: Optional[str] = None
    operator_name: Optional[str] = "Personal de Campo"
    notes: Optional[str] = None
