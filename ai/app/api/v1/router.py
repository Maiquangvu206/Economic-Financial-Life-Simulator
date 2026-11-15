from fastapi import APIRouter, Depends

from app.api.v1 import education, gm, judge, news, npc, recruitment, underworld
from app.core.security import require_service_token

router = APIRouter(prefix="/v1", dependencies=[Depends(require_service_token)])
router.include_router(judge.router)
router.include_router(news.router)
router.include_router(npc.router)
router.include_router(gm.router)
router.include_router(recruitment.router)
router.include_router(education.router)
router.include_router(underworld.router)
