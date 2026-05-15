"""
Vercel FastAPI 진입 파일 자동 탐색용 심.
실제 앱은 api/server.py 의 `app` 을 그대로 노출합니다.
"""
from api.server import app

__all__ = ["app"]
