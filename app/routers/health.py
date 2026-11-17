from fastapi import APIRouter
from app.schemas.health import HealthEventCreate
from app.services import health_service

router = APIRouter(prefix="/api/health-events", tags=["Health & Veterinary Treatments"])

@router.get("")
def get_health_events():
    return health_service.get_all_health_events()

@router.post("")
def create_health_event(he: HealthEventCreate):
    return health_service.record_new_treatment(he)
