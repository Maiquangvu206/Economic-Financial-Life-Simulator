from fastapi import APIRouter, Depends

from app.api.v1 import gm, judge, news, npc
from app.core.security import require_service_token

router = APIRouter(prefix="/v1", dependencies=[Depends(require_service_token)])
router.include_router(judge.router)
router.include_router(news.router)
router.include_router(npc.router)
router.include_router(gm.router)
