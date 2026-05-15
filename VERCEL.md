# Vercel 배포 체크리스트

## `No FastAPI entrypoint found`

- **권장:** Vercel 프로젝트 **Root Directory = `frontend`** → Next만 올리면 이 메시지와 무관합니다.
- 루트로 올릴 때: **`pyproject.toml`** 에 `entrypoint = "api.server:app"` (`모듈:FastAPI app` 형식).

## 500 `FUNCTION_INVOCATION_FAILED` 가 날 때

1. **Project Settings → General → Root Directory** 를 **`frontend`** 로 설정했는지 확인합니다.  
   저장소 루트에 있는 **`api/`** 는 Python 패키지입니다. Root Directory 가 `.` 이면 Vercel이 이를 **서버리스 API**로 다루려다 깨질 수 있습니다.

2. 배포 후에도 동일하면 Vercel **Logs** 탭에서 해당 요청의 스택 트레이스를 확인합니다.

3. `/chat/[missionId]` 는 `useSearchParams` 를 쓰므로, 세그먼트에 `Suspense` 래퍼(`app/chat/[id]/layout.tsx`)가 있습니다. 캐시 무효화 후 재배포합니다.

## 권장 환경 변수

| 변수 | 설명 |
|------|------|
| `NEXT_PUBLIC_BREMEN_DEMO_MODE` | `true`면 데모 데이터·로컬 시뮬에 유리 |

API URL을 프론트에서 쓸 경우에만 `NEXT_PUBLIC_*` 로 별도 정의하세요.
