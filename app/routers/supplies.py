from fastapi import APIRouter
from app.schemas.supplies import SupplyMovementRequest
from app.services import supply_service

router = APIRouter(prefix="/api/supplies", tags=["Supplies & Feed Warehouse"])

@router.get("")
def get_supplies():
    return supply_service.get_all_supplies_with_stock()

@router.post("/movement")
def add_supply_movement(m: SupplyMovementRequest):
    return supply_service.record_supply_movement(m)
