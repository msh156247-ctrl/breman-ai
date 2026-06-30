# Local E2E QA Report

Date: 2026-06-25

Environment:

- Frontend: `http://127.0.0.1:3103`
- API: `http://127.0.0.1:8100`
- Auth: JWT-only
- Runtime: isolated temporary database and decision log
- Next build cache: isolated from the existing port 3003 server

## Results

| Scenario | Result | Evidence |
| --- | --- | --- |
| API health and security | Pass | `healthy`, `jwt_only`, encrypted key storage, indexed decision log |
| Account A workspace restore | Pass | Three A nodes and two edges restored |
| Account B isolation | Pass | B graph visible, A graph absent |
| Return to account A | Pass | A positions, links, approval settings restored |
| Flow detail node selection | Pass | Node click moved to selection settings |
| Approval settings | Pass | `before_run`, admin queue, target persisted |
| Condition settings | Pass | Time condition persisted and runtime contract rendered |
| Loop region | Pass | Two selected steps created a fixed-boundary loop |
| Human Gate | Pass | Mission stopped at `awaiting_approval` |
| Approval and resume | Pass | Approval event emitted and mission completed |
| Runs and Chat consistency | Pass | Same mission ID, completed state, timeline and owner |
| Console errors | Pass | No application console error or warning during the core flow |
| Horizontal overflow at 1280 | Pass | Document width matched client width |

## Findings Fixed During QA

### P1: New mission briefly displayed local preview

The Chat page could commit to fallback before the initial API snapshot was
available. Runtime snapshot loading now retries once, and WebSocket fallback
waits for the API snapshot before switching source mode.

### P1: QA and existing dev servers shared `.next`

Ports 3003 and 3103 used the same Next build cache, which mixed demo/live
environment chunks. The isolated stack now uses a run-specific `distDir`.

## Staging Smoke

Date: 2026-06-29

Environment:

- Frontend: `https://breman-ai-staging.vercel.app`
- API: `https://api-production-39f0.up.railway.app`
- Auth: JWT-only
- Runtime: Railway persistent `/data/runtime`

| Scenario | Result | Evidence |
| --- | --- | --- |
| Railway health | Pass | `healthy`, `jwt_only`, encrypted key storage, indexed decision log, warnings empty |
| Fixed CORS origin | Pass | `Access-Control-Allow-Origin: https://breman-ai-staging.vercel.app` |
| Vercel frontend | Pass | `200`, title `Bremen - Workforce Runtime OS` |
| Account A/B API smoke | Pass | Workspace isolation true |
| Human Gate API smoke | Pass | Mission `8b68537d` reached approval, resumed, and completed |

## Local E2E Rerun After API Split

Date: 2026-06-29

Environment:

- Frontend: `http://127.0.0.1:3103`
- API: `http://127.0.0.1:8100`
- Auth: JWT-only
- Runtime: isolated temporary database and decision log
- Branch: `staging/e2e-readiness`

| Scenario | Result | Evidence |
| --- | --- | --- |
| API health and security | Pass | `healthy`, `jwt_only`, encrypted key storage, indexed decision log |
| Account A/B API smoke | Pass | Workspace isolation true |
| Human Gate API smoke | Pass | Mission `e053d47b` reached approval, resumed, and completed |
| Timeline consistency | Pass | `human_gate_requested`, `human_gate_approved`, `mission_completed` observed |
| Studio QA bootstrap | Pass | `/qa/bootstrap` stored account A session and redirected to `/studio` |
| Studio initial UI | Pass | Page title `Bremen - Workforce Runtime OS`, Studio/runtime CTA content present |
| Studio console errors | Pass | No browser console warning/error after initial `/studio` load |
| Responsive UI smoke | Pass | Headless Edge checked `/studio`, `/runs`, `/market?tab=agents`, `/mypage?tab=approval`, `/guide` at `1280x720`, `663x912`, `627x699`; horizontal overflow 0, tiny target findings 0, browser error/warning logs 0 |

Notes:

- The E2E stack was stopped after the run and generated session files were deleted.
- The responsive sweep now runs through `scripts/e2e-responsive-smoke.mjs`, which uses local Edge/Chrome CDP and does not require third-party browser test packages.
