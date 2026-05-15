# Bremen Web MVP

FastAPI(WebSocket) + Next.js(React Flow) 기반 브래맨 실시간 대시보드 MVP입니다.

## Canonical Path

- 공식 프론트엔드 경로: `c:/Users/명성현/Desktop/project/breman/bremen-web/frontend`
- 구 Vite 실험 폴더(`breman-ui`)는 deprecated 상태입니다.

## 1) 백엔드 실행

```bash
cd "c:/Users/명성현/Desktop/project/breman/bremen-web"
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m api.server
```

## 2) 프론트엔드 실행

```bash
cd "c:/Users/명성현/Desktop/project/breman/bremen-web/frontend"
npm install
npm run dev
```

접속: `http://localhost:3000`

## Vercel 배포 (프론트만)

이 저장소 루트에는 Python용 `api/` 디렉터리가 있습니다. Vercel은 루트에 `api/`가 있으면 **Serverless Functions 경로**로 오인할 수 있어, **빌드/런타임 500**이 날 수 있습니다.

**반드시 Vercel 프로젝트 → Settings → General → Root Directory 를 `frontend` 로 지정**한 뒤 다시 배포하세요. (또는 **Build and Deployment** 에서 동일 항목)

`No FastAPI entrypoint found` 가 보이면 Vercel이 **저장소 루트를 Python 프로젝트로 빌드** 중인 것입니다. Root Directory 를 `frontend` 로 바꾸면 해결되는 경우가 대부분입니다. 루트 배포 시 **`pyproject.toml`** (`api.server:app`)과 저장소 루트 **`server.py`** / **`api/main.py`**(Vercel 기본 스캔 경로) 를 사용합니다.

- **Install Command**: 비워 두거나 `npm install` (Root가 `frontend`일 때)
- **Build Command**: 비워 두거나 `npm run build`
- 선택: Environment `NEXT_PUBLIC_BREMEN_DEMO_MODE` = `true` (데모 UI)

백엔드(FastAPI)는 Vercel이 아닌 별도 호스트(Railway, Render, VM 등)에서 `python -m api.server` 로 띄우는 구성을 권장합니다.

## API

- `POST /api/missions`
- `GET /api/missions`
- `GET /api/missions/{mission_id}`
- `GET /api/missions/{mission_id}/artifacts`
- `GET /api/missions/{mission_id}/timeline`
- `GET /api/missions/{mission_id}/evaluations`
- `POST /api/missions/{mission_id}/approve`
- `GET /api/capabilities`
- `POST /api/keys/register`
- `GET /api/keys/status`
- `GET /api/keys-history?limit=20&offset=0&provider=...&actor=...&action=...`
- `DELETE /api/keys/{provider}`
- `POST /api/members`
- `GET /api/members/{member_id}/trust`
- `GET /api/policies`
- `POST /api/policies/check`
- `POST /api/memory/put`
- `GET /api/memory/{scope}/{scope_id}`
- `POST /api/memory/filter-transfer`
- `POST /api/teams`
- `GET /api/teams`
- `GET /api/teams/{team_id}`
- `POST /api/teams/{team_id}/members`
- `POST /api/channels`
- `GET /api/channels`
- `POST /api/channels/{channel_id}/publish`
- `POST /api/contracts/team-royalty`
- `GET /api/contracts/team-royalty`
- `PATCH /api/contracts/team-royalty/{contract_id}/active`
- `GET /api/contracts/team-royalty/history?source_team_id=...&target_team_id=...`
- `POST /api/ledger/royalty/simulate`
- `GET /api/ledger`
- `GET /api/ledger/settlements?cycle=daily|weekly|monthly&team_id=...`
- `GET /api/admin/db/integrity` (admin)
- `POST /api/admin/db/backup?label=...` (admin)
- `GET /api/graph/teams`
- `GET /api/ontology`
- `GET /api/routing/preview?goal=...`
- `GET /api/health`
- `WS /ws`
- `WS /ws/{mission_id}`

## Ontology Runtime

- Ontology 파일: `ontology.yaml`
- Composer는 기본적으로 `ontology.yaml`의 `workflows.webapp_default`를 컴파일해서 Task Graph를 생성합니다.
- 로드 실패 시 기존 fallback task 플랜으로 자동 전환됩니다.

## Artifact Contract (Hard Gate)

- 스키마 파일: `artifact_schemas.yaml`
- 각 role 산출물은 `ValidationEngine`으로 검증됩니다.
- 검증 실패 시 `task_validation_failed` 이벤트 발생 후 재시도/실패 분기로 처리되며, `completed`로 진행되지 않습니다.

### Goal 기반 Workflow 라우팅

- 라우팅 규칙은 `ontology.yaml`의 `routing_rules`에서 관리합니다.
- 코드 수정 없이 `include_any`, `exclude_any`, `default`만 바꿔서 워크플로 선택 정책을 변경할 수 있습니다.
- `priority`(높을수록 우선), `include_regex`, `exclude_regex`도 지원합니다.
- `/api/routing/preview`로 선택된 워크플로와 룰 매칭 근거를 확인할 수 있습니다.

## Decision Log

- 이벤트는 `runtime/decision_log.jsonl`에 누적 저장됩니다.
- 미션별 이벤트는 `/api/missions/{mission_id}/timeline`에서 조회 가능합니다.

## DB Persistence (P1 Stage-1)

- 기본 DB: `runtime/bremen.db` (SQLite)
- ORM: SQLAlchemy
- 1차 영속화 적용 범위:
  - Provider Key Registry
  - Key History (audit trail)
- 스키마(placeholder)로 `members`, `teams`, `channels`, `contracts`, `ledger` 테이블도 생성되어 다음 단계 전환 준비가 완료됩니다.

## DB Persistence (P1 Stage-2)

- `member_store`, `team_store`, `channel_store`, `contract_store`, `ledger_store` JSON payload 기반 영속화 적용
- 서버 재시작 후에도 아래 데이터 유지:
  - member / team / channel / contract / ledger
- 기존 API 응답 포맷은 유지하면서 저장소만 DB로 전환되었습니다.

## DB Persistence (P1 Stage-3)

- `ledger_store`에 집계용 컬럼(`receiver_team_id`, `provider_cost`, `royalty_cost`, `platform_fee`, `total_cost`) 추가
- 경량 마이그레이션(앱 시작 시 `ALTER TABLE` 보강) 적용
- `key_history`, `contract_store`, `ledger_store` 조회 인덱스 추가
- 정산 API(`/api/ledger/settlements`)는 Python 루프 대신 SQL `GROUP BY` 집계로 최적화

## DB Ops (P1 Stage-4)

- 무결성 체크 API:
  - `GET /api/admin/db/integrity` (`X-Admin-Token` 필요)
- DB 백업 API:
  - `POST /api/admin/db/backup?label=...` (`X-Admin-Token` 필요)
- 무결성 체크는 orphan 관계(team-member, channel-team, contract-team, ledger-team)를 탐지합니다.

## Capability & Trust (P1~P3)

- capability 정의 파일: `capabilities.yaml`
- capability 조회: `/api/capabilities`
- member 생성(capabilities 포함): `/api/members`
- trust 조회: `/api/members/{member_id}/trust`
- trust 로그 파일: `runtime/trust_log.jsonl`

## Provider API Key Registry

- 개인이 발급한 provider API key를 먼저 등록해야 해당 provider를 사용할 수 있습니다.
- 관리자 보호: key 변경 API는 `X-Admin-Token` 헤더가 필요합니다.
  - 서버 환경변수: `BREMEN_ADMIN_TOKEN` (미설정 시 기본값 `bremen-admin-dev`)
- 프론트에서는 `NEXT_PUBLIC_BREMEN_ADMIN_TOKEN` 설정이 없으면 key 등록/삭제 UI가 차단됩니다.
- actor는 인증 헤더(`X-User-Id`)에서 서버가 자동 기록합니다. (`X-User-Id` 없으면 `system`)
- 권한 헤더(`X-User-Role`) 기반 role 체크(예: owner/admin) 적용
- 키 등록 API:
  - `POST /api/keys/register` (`provider`, `api_key`) + `X-Admin-Token` + `X-User-Id` + `X-User-Role`
  - `GET /api/keys/status`
  - `GET /api/keys-history?limit=20&offset=0&provider=...&actor=...&action=...`
  - `DELETE /api/keys/{provider}` + `X-Admin-Token` + `X-User-Id` + `X-User-Role`
- 키 이력에는 `action(register/delete)`와 `actor(변경 주체)`가 함께 기록됩니다.
- 감사 필드로 `ip`, `user_agent`도 함께 기록됩니다.
- 검증 에러 응답(422)은 서버에서 민감 필드(`api_key`, `authorization`, `x-admin-token`)를 자동 마스킹합니다.

### Auth Debug

- `GET /api/auth/whoami` (`X-User-Id`, `X-User-Role`)로 서버가 인식한 identity를 확인할 수 있습니다.

### Auth Header Standard

- 공통 인증 헤더:
  - `X-User-Id`: 실행 주체 식별자
  - `X-User-Role`: `owner|admin|supervisor|member|viewer`
- 관리자 보호 API 추가 헤더:
  - `X-Admin-Token` (`BREMEN_ADMIN_TOKEN`과 일치 필요)
- JWT(1차 전환):
  - `Authorization: Bearer <jwt>` 지원
  - JWT payload의 `sub`(또는 `user_id`) + `role`이 유효하면 서버가 이를 우선 신뢰합니다.
  - JWT가 없을 때 기존 `X-User-Id`, `X-User-Role` fallback 동작을 유지합니다.
  - 개발 기본 시크릿: `BREMEN_JWT_SECRET` 미설정 시 내장 dev secret 사용 (운영에서는 반드시 환경변수 설정 권장)
  - JWT 검증: `exp` 필수, `BREMEN_JWT_ISSUER`/`BREMEN_JWT_AUDIENCE` 설정 시 `iss`/`aud` 검증 수행
  - `BREMEN_AUTH_JWT_ONLY=true` 설정 시 헤더 fallback 없이 JWT-only 모드로 동작
- 권한 거부 시 표준 응답:
  - `403 {"detail":"role_not_allowed:<role>"}`
  - 리소스 스코프 거부는 목적별 detail(`mission_access_denied`, `team_view_permission_required` 등) 반환

### CI Regression

- GitHub Actions: `.github/workflows/rbac-regression.yml`
- 실행 테스트: `python -m pytest -q tests/test_rbac_regression.py`
- 최소 보장 범위:
  - mission owner ACL
  - key/policy/ontology read guard
  - settlement/team scope guard
  - websocket access guard
  - mission owner DB fallback

### Role Guard (Phase-1)

- 쓰기 API role 체크:
  - `POST /api/teams` -> `owner|admin|supervisor`
  - `POST /api/teams/{team_id}/members` -> `owner|admin|supervisor`
  - `POST /api/channels` -> `owner|admin|supervisor`
  - `POST /api/channels/{channel_id}/publish` -> `owner|admin|supervisor|member`
  - `POST /api/contracts/team-royalty` -> `owner|admin`
  - `PATCH /api/contracts/team-royalty/{contract_id}/active` -> `owner|admin`

### Team Ownership Guard (Phase-2)

- 팀 생성 시 `created_by`가 저장됩니다.
- `owner|admin`은 전역 관리 가능, 그 외에는 아래 조건을 만족해야 팀 관리(write)가 가능합니다.
  - `created_by == X-User-Id`, 또는
  - 해당 팀 멤버로 등록되어 있고 `role_type in {supervisor, channel_supervisor}`
- 적용 범위:
  - `POST /api/teams/{team_id}/members`
  - `POST /api/channels` (source team 기준)
  - `POST /api/channels/{channel_id}/publish`는 `owner|admin`이 아니면 `X-User-Id == sender_member_id` 여야 합니다.

### Read Scope Guard (Phase-3)

- 읽기 API도 `X-User-Id`, `X-User-Role` 기준으로 서버 필터링됩니다.
- `owner|admin`은 전체 조회 가능, 그 외 role은 접근 가능한 팀 범위만 조회됩니다.
  - `GET /api/teams` (가시 팀만)
  - `GET /api/teams/{team_id}` (권한 없으면 403)
  - `GET /api/channels` (source/target 중 하나라도 가시 팀이면 노출)
  - `GET /api/contracts/team-royalty` (source/target 중 하나라도 가시 팀이면 노출)
  - `GET /api/contracts/team-royalty/history` (요청 pair 둘 다 비가시면 403)
  - `GET /api/graph/teams` (가시 팀 그래프만 노출)
  - `GET /api/ledger` (가시 팀 관련 원장만 노출)
  - `GET /api/ledger/settlements` (가시 팀 정산만 노출, 지정 team_id가 비가시면 403)

### Execution Guard (Phase-4)

- 실행/리소스 생성 API에 role guard 추가:
  - `POST /api/missions` -> `owner|admin|supervisor|member`
  - `POST /api/members` -> `owner|admin|supervisor`
- 프론트 미션 실행 요청도 `X-User-Id`, `X-User-Role` 헤더를 포함합니다.

### Mission Access Guard (Phase-5)

- 미션 생성 시 서버가 `mission owner`를 기록합니다.
- 미션 스코프 API는 `owner|admin` 또는 해당 mission owner만 접근 가능합니다.
  - `GET /api/missions`
  - `GET /api/missions/{mission_id}`
  - `POST /api/missions/{mission_id}/approve`
  - `GET /api/missions/{mission_id}/artifacts`
  - `GET /api/missions/{mission_id}/timeline`
  - `GET /api/missions/{mission_id}/evaluations`
- 프론트 timeline/artifacts/approve 호출도 `X-User-Id`, `X-User-Role` 헤더를 포함합니다.
- 감사 추적:
  - `mission_created` 이벤트에 `created_by`, `created_role` 기록
  - `human_gate_approved` 이벤트에 `approved_by`, `approved_role` 기록
  - `GET /api/missions`, `GET /api/missions/{mission_id}` 응답에 `owner_id` 포함

### WebSocket Access Guard (Phase-6)

- WebSocket identity는 query param으로 전달합니다: `user_id`, `user_role`
- `GET /ws`(global stream): `owner|admin`만 연결 허용
- `GET /ws/{mission_id}`(mission stream): `owner|admin` 또는 mission owner만 연결 허용
- 권한이 없으면 WebSocket close code `1008`로 종료됩니다.
- 프론트는 role/상태에 따라 자동 라우팅:
  - `owner|admin` + mission 미선택: `/ws`
  - mission 선택/실행 중: `/ws/{mission_id}` (member/supervisor도 자기 mission 실시간 이벤트 수신 가능)

### Policy/Memory Guard (Phase-7)

- `policy` 민감 정보/시뮬레이션 API는 `owner|admin|supervisor`만 허용:
  - `GET /api/policies`
  - `POST /api/policies/check`
- `memory` API는 실행 주체 role만 허용(`owner|admin|supervisor|member`):
  - `POST /api/memory/put`
  - `GET /api/memory/{scope}/{scope_id}`
  - `POST /api/memory/filter-transfer`
- `GET /api/members/{member_id}/trust`도 `viewer`를 제외한 실행 role만 허용됩니다.

### Ontology/Routing Guard (Phase-8)

- 설계 메타데이터 노출 API는 `viewer`를 차단하고 실행 role만 허용:
  - `GET /api/ontology` -> `owner|admin|supervisor|member`
  - `GET /api/routing/preview` -> `owner|admin|supervisor|member`

### Key Read Guard (Phase-9)

- 키 조회 계열 API도 `owner|admin`으로 제한됩니다.
  - `GET /api/keys/status`
  - `GET /api/keys-history`
- 프론트는 해당 API `403` 시 권한 부족 토스트를 표시합니다.

### Auth Permission Snapshot (Phase-10)

- `GET /api/auth/permissions` 추가:
  - header: `X-User-Id`, `X-User-Role`
  - optional query: `mission_id`
  - 반환: `can_manage_keys`, `can_run_mission`, `can_manage_policies`, `can_access_global_ws`, `can_access_mission`
- 프론트는 버튼/패널 활성화를 role 하드코딩 대신 permission snapshot 기준으로 동기화합니다.

### Mission Owner Persistence (Phase-11)

- mission ACL의 핵심 키(`mission_id -> owner_id`)를 DB에 영속 저장합니다.
- 미션 접근 판정은 in-memory 캐시 + DB fallback 방식으로 동작해, 서버 재기동 이후에도 owner 기반 접근제어가 유지됩니다.

### JWT Auth Bridge (Phase-12)

- 서버 미들웨어에서 `Authorization` JWT를 해석해 request identity context를 구성합니다.
- `_resolve_identity()`는 JWT identity가 있으면 이를 우선 사용하고, 없으면 헤더 기반 fallback을 사용합니다.
- `GET /api/auth/whoami` 응답에 `source(jwt|header)`가 포함되어 현재 인증 소스를 확인할 수 있습니다.
- WS(`?jwt=`)도 동일한 JWT 검증 규칙(`exp` + optional `iss/aud`)을 사용합니다.
- 롤아웃 모니터링:
  - `GET /api/auth/migration-stats` (`owner|admin`)로 JWT/헤더 사용 비율과 오류 비율을 조회할 수 있습니다.
  - 응답 헤더 `X-Auth-Mode`, `X-Auth-Source`, `X-Auth-Error`로 요청 단위 인증 상태를 확인할 수 있습니다.
  - 보안 원칙: `Authorization`이 존재하지만 JWT 검증이 실패하면 헤더 identity로 폴백하지 않고 `401`을 반환합니다.
  - migration stats는 in-memory 집계이며 단일 프로세스 범위 통계입니다.
- 키 미등록 상태에서는:
  - `POST /api/members`에서 해당 provider 멤버 생성 차단
  - `POST /api/missions`에서 `use_mock=false` 실행 차단 (openai 기준)
- 보안상 key 원문은 응답으로 반환하지 않고 masked 값만 제공합니다.

## Evaluation Layer (P4)

- `execution_pass`와 `quality_pass`를 분리 기록합니다.
- 평가 이벤트 타입: `evaluation_result`
- 미션 평가 조회: `/api/missions/{mission_id}/evaluations`
- 품질 게이트 실패 시 `task_quality_failed` 후 재시도/실패 분기됩니다.

## Policy Engine (P5)

- 정책 파일: `policy_rules.yaml`
- Composer 실행 전 정책 훅:
  - `mission_start` 정책 체크
  - `task_pre_execution` 정책 체크
- 정책 조회: `GET /api/policies`
- 정책 시뮬레이션 체크: `POST /api/policies/check`

## Memory Scope (P6)

- 지원 스코프: `global`, `team`, `mission`, `member`, `ephemeral`
- 메모리 저장: `POST /api/memory/put`
- 스코프 조회: `GET /api/memory/{scope}/{scope_id}`
- 스코프 전송 필터: `POST /api/memory/filter-transfer`
- 기본 보호 규칙:
  - `ephemeral -> persistent` 승격 차단
  - `member -> global` 차단
  - `classification=restricted`는 외부 publish override 없으면 차단

## Team/Channel/Royalty (Platform v2)

- 팀 생성/조회/멤버 할당 API 제공
- 팀 간 채널 생성 및 메시지 publish API 제공
- 멤버 프로필의 `royalty_rate`를 활용한 로열티 시뮬레이션 API 제공
- 미션 실행 시 `team_id`를 지정하면 미션 종료 후 팀 멤버 기준 로열티 원장(`GET /api/ledger`)이 기록됩니다.
- `role_type` 기반 채널 publish 권한 강제:
  - 허용: `supervisor`, `channel_supervisor`
  - 차단: `executor`
- 팀 간 로열티 계약 API:
  - `POST /api/contracts/team-royalty`
  - `GET /api/contracts/team-royalty`
- 동일 팀 페어 계약은 `version`이 자동 증가하고, 새 계약을 active로 생성하면 기존 active 계약은 자동 비활성화됩니다.
- 계약 활성/비활성 전환 API:
  - `PATCH /api/contracts/team-royalty/{contract_id}/active`
- 계약 히스토리 조회 API:
  - `GET /api/contracts/team-royalty/history?source_team_id=...&target_team_id=...`
- 채널 publish 시 계약이 존재하고 `provider_cost > 0`이면 inter-team 로열티 원장이 자동 기록됩니다.
- 팀 그래프 API (`GET /api/graph/teams`)로 팀 노드/채널 엣지/메시지 수/로열티 수익 메트릭을 조회할 수 있습니다.
- 정산 집계 API (`GET /api/ledger/settlements`)로 일/주/월 단위 팀별 로열티 정산 요약을 조회할 수 있습니다.
