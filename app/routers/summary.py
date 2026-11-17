from fastapi import APIRouter
from app.services.summary_service import calculate_dashboard_summary

router = APIRouter(prefix="/api/summary", tags=["Dashboard Summary"])

@router.get("")
def get_summary():
    return calculate_dashboard_summary()
