from __future__ import annotations

from fastapi import APIRouter, Depends, status

from src.requests.schemas.request import Request, RequestCreate
from src.requests.services.request_service import RequestService, get_request_service


router = APIRouter(prefix="/requests", tags=["requests"])


@router.post("", response_model=Request, status_code=status.HTTP_201_CREATED)
async def create_request(
    payload: RequestCreate,
    service: RequestService = Depends(get_request_service),
) -> Request:
    return service.create_request(payload)
