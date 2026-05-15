# Vercel 배포 체크리스트

## `No FastAPI entrypoint found`

- **거의 항상:** **Framework Preset이 FastAPI(또는 Other)** 로 잡혀 있는데 실제 코드는 **`frontend`의 Next.js** 인 경우입니다. **Settings → Build and Deployment → Framework Preset → `Next.js`** 로 바꾼 뒤 재배포하세요.
- **Root Directory = `frontend`** 권장. 이때 Python `api/` 는 배포 루트에 없으므로, 위 메시지는 프레임워크 오인 시 가장 흔합니다.
- 저장소 **루트**를 배포 루트로 둘 때는 루트 **`vercel.json`** 이 `cd frontend && npm run build` 를 수행합니다. (엔트리포인트 보강용으로 루트에 **`pyproject.toml`**, **`server.py`**, **`api/main.py`** 가 있을 수 있습니다.)

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
