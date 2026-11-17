from fastapi import APIRouter
from app.schemas.livestock import PaddockCreate, BatchCreate, QuickCounterUpdate, BatchMovementRequest
from app.services import livestock_service

router = APIRouter(prefix="/api", tags=["Livestock & Infrastructure"])

# Lotes de Hacienda
@router.get("/batches")
def get_batches():
    return livestock_service.get_all_batches()

@router.post("/batches")
def create_batch(b: BatchCreate):
    return livestock_service.create_new_batch(b)

@router.post("/batches/quick-counter")
def quick_counter(q: QuickCounterUpdate):
    return livestock_service.update_quick_counter(q)

@router.post("/batches/move")
def move_batch(m: BatchMovementRequest):
    return livestock_service.process_batch_movement(m)

# Potreros y Ubicaciones
@router.get("/paddocks")
def get_paddocks():
    return livestock_service.get_all_paddocks()

@router.post("/paddocks")
def create_paddock(p: PaddockCreate):
    return livestock_service.create_new_paddock(p)

# Catálogos Auxiliares
@router.get("/categories")
def get_categories():
    return livestock_service.get_all_categories()

@router.get("/warehouses")
def get_warehouses():
    return livestock_service.get_all_warehouses()

# Auditoría
@router.get("/history")
def get_history():
    return livestock_service.get_history_movements()
