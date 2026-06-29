# Bremen Staging

## Railway API

Deploy the repository root with `railway.toml`.

Current staging API:

- `https://api-production-39f0.up.railway.app`

Required variables:

- `BREMEN_ENV=staging`
- `BREMEN_AUTH_JWT_ONLY=true`
- `BREMEN_JWT_SECRET`: random, at least 32 characters
- `BREMEN_KEY_ENCRYPTION_SECRET`: random, at least 32 characters
- `BREMEN_ADMIN_TOKEN`: random, at least 24 characters
- `BREMEN_JWT_ISSUER=bremen-staging`
- `BREMEN_JWT_AUDIENCE=bremen-staging-web`
- `BREMEN_RUNTIME_DIR=/data/runtime`
- `BREMEN_CORS_ORIGINS=https://<fixed-vercel-staging-alias>`

Attach one persistent volume at `/data` and keep the service at one replica.
The healthcheck is `GET /api/health` and must report:

- `status: healthy`
- `auth_mode: jwt_only`
- `decision_log.indexed: true`

Do not expose the administrator token to the frontend.

## Vercel Frontend

Set the project root directory to `frontend`.

Current staging frontend:

- `https://breman-ai-staging.vercel.app`

Required variables:

- `NEXT_PUBLIC_BREMEN_API_BASE_URL=https://<railway-api-host>`
- `NEXT_PUBLIC_BREMEN_WS_BASE_URL=wss://<railway-api-host>`
- `NEXT_PUBLIC_BREMEN_DEMO_MODE=false`
- `NEXT_PUBLIC_BREMEN_AUTH_MODE=jwt_only`

Do not set `NEXT_PUBLIC_BREMEN_ADMIN_TOKEN` or
`NEXT_PUBLIC_BREMEN_E2E_MODE` in staging.

The frontend deploy uploads only `frontend/`. `frontend/.vercelignore`
excludes local Next caches and logs, and
`frontend/scripts/generate-ontology.cjs` reuses the checked-in
`generated/ontology.json` when the repository-root `ontology.yaml` is not
available in Vercel's frontend-only build context.

## QA Session

Issue short-lived owner JWTs outside the browser:

```powershell
python scripts/bootstrap-e2e-sessions.py `
  --api-base-url https://<railway-api-host> `
  --run-id staging-smoke `
  --output runtime/e2e-session-staging-smoke.json
```

`BREMEN_ADMIN_TOKEN` must be supplied only through the command environment.
Delete the generated session file after QA.
