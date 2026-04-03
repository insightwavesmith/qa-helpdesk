import os
from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader

BRICK_API_KEY = os.getenv("BRICK_API_KEY", "")
api_key_header = APIKeyHeader(name="X-Brick-API-Key", auto_error=False)

async def verify_brick_api_key(api_key: str = Security(api_key_header)) -> str:
    """Brick API Key 검증. 미설정 시 개발 모드 통과."""
    if not BRICK_API_KEY:
        # 개발 모드
        return "dev"

    if api_key != BRICK_API_KEY:
        raise HTTPException(status_code=401, detail="인증 실패: 유효하지 않은 API Key")

    return api_key
