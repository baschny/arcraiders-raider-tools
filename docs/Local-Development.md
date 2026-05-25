# Local Development (server-backed state)
This document covers how to run the server-backed parts of raider-tools fully offline:
- A local DynamoDB (Docker) that replaces the real `raider-tools-users` table.
- A tiny Node HTTP server that hosts the **same** `profile.ts` / `state.ts` / `links.ts` / `embark-link.ts` / `arctracker-user-proxy.ts` Lambda handlers used in production, pointed at the local DynamoDB where applicable.
- A fake "sign in as dev user" flow that bypasses Cognito entirely.
This lets you exercise `UserStateStore` against a real DynamoDB, iterate on Lambda handler code, and test sign-in hydration + sign-out wipe without ever touching AWS.
For the production equivalents of these moving parts, see `Authentication.md` and `User-Data.md`.
## Prerequisites
- Docker Desktop (for DynamoDB Local).
- Node 20+ (`nvm use 20`).
- `npm install` at the repo root and inside `infra/`.
## One-time setup
```bash
# Repo root
npm install
cd infra
npm install
cd ..
```
Create a local env file at the repo root (`.env.local`, gitignored):
```dotenv
# Turn on dev-auth + point the SPA at the local API server.
VITE_DEV_AUTH=true
VITE_API_BASE_URL=http://localhost:4000
# Optional: override the local API port (must match LOCAL_API_PORT in infra).
# VITE_LOCAL_API_PORT=4000
```
`VITE_DEV_AUTH=true` MUST NOT be set in production Amplify builds — it disables every real sign-in path and switches the SPA to an unsigned dev bearer token.
## The three processes
You need three terminals (or run each in the background).
### 1. DynamoDB Local (Docker)
```bash
cd infra
npm run local:ddb        # starts raider-tools-dynamodb-local on :8000
```
Data persists under `infra/local/.data/` (gitignored). Tear down with:
```bash
npm run local:ddb:down
```
Wipe all local data:
```bash
npm run local:ddb:down
/bin/rm -rf local/.data
```
### 2. Local API server
```bash
cd infra
npm run local:api        # starts http://localhost:4000
```
On first boot the server creates the `raider-tools-users` table (pk/sk only, on-demand billing). It reuses `infra/lambda/profile.ts`, `state.ts`, `links.ts`, and `embark-link.ts` by constructing synthetic API Gateway events, so any fix made to those files is picked up on restart.

The local API server automatically reads:
- `infra/.env`
- `infra/.env.local`

with `.env.local` overriding `.env`. Use [infra/.env.example](/Users/ernst/Develop/Games/ArcRaiders/raider-tools/infra/.env.example) as the template for local server-side settings such as Embark OAuth/config values.

Environment overrides (all optional):
The local API server loads `infra/.env` before applying defaults. Values already exported in your shell take precedence over `infra/.env`.

- `LOCAL_API_PORT` — default `4000`.
- `AWS_ENDPOINT_URL_DYNAMODB` — default `http://localhost:8000`.
- `USER_TABLE_NAME` — default `raider-tools-users`.
- `ALLOWED_ORIGINS` — default `http://localhost:5173`.
- `LOCAL_COGNITO_GROUPS` — when unset, local dev bypasses Cognito group gates. Set to a comma-separated list such as `embark-auth` to test exact group membership, or set it to an empty value to test a signed-in user with no groups.
- `ARC_APP_KEY` — required when linking or syncing ArcTracker data locally. This is the ArcTracker app key injected by the relay, not the user's `arc_u1_*` token.
- `LOCAL_TOKEN_ENCRYPTION_KEY` — local-only key material used to encrypt linked account tokens in DynamoDB Local when `KMS_KEY_ID` is not set.
- `EMBARK_OAUTH_CLIENT_SECRET` — required only if you want the local Embark `/start` + `/complete` flow to reach the real Embark OAuth/token endpoints.
- `EMBARK_MANIFEST_ID` and `EMBARK_USER_AGENT` — required only if you want the local Embark completion flow to fetch `/v1/shared/profile`.
- `EMBARK_LOOPBACK_REDIRECT_URI` — default `http://127.0.0.1:49176`.

Embark-specific caveats:
- Refresh-token handling is not available because the upstream Embark auth server is currently broken for refresh use. Re-authenticate after expiry; revisit this after June 2026.
- The loopback redirect is meant for the browser extension. If the extension is not available, the current fallback is a manual callback URL domain/host rewrite following site-owner instructions.
### 3. Vite dev server
```bash
# Repo root
npm run dev              # starts http://localhost:5173
```
Open http://localhost:5173, navigate to `/auth/sign-in`, enter a dev sub (default `dev-user-1`) and optional email, submit. The SPA now drives `UserStateStore` through `PUT /me/state/<domain>` against the local API server.
## Verifying the round-trip
Peek at DynamoDB Local directly:
```bash
aws dynamodb --endpoint-url http://localhost:8000 \
    scan --table-name raider-tools-users --no-cli-pager
```
Health check:
```bash
curl http://localhost:4000/healthz
```
End-to-end sanity:
```bash
curl -H 'Authorization: Bearer dev.dev-user-1' http://localhost:4000/me
```
After linking an ArcTracker token as `dev.dev-user-1`, the authenticated user proxy can be smoke-tested without exposing the ArcTracker token to the browser:
```bash
curl -i \
  -H 'Authorization: Bearer dev.dev-user-1' \
  http://localhost:4000/me/arctracker/v2/user/profile
```
## Dev-auth token format
The local server accepts one authorization scheme:
```
Authorization: Bearer dev.<sub>[.<email>]
```
- `<sub>` is the user id used as the DynamoDB partition prefix (`USER#<sub>`).
- `<email>` is optional; surfaced to `profile.ts` as the `email` JWT claim.
- No signing, no validation — this works only for the local server.
`src/shared/auth/devAuthClient.ts` emits exactly this format; nothing else in the SPA talks to the server directly.
## Scope & non-goals
The local setup deliberately skips:
- **AWS KMS for linked-account token encryption.** `PUT /me/links/arctracker` validates with the shared ArcTracker forwarding helper and stores an AES-GCM-encrypted local-dev envelope in DynamoDB Local. Production still requires KMS.
- **Anonymous ArcTracker profile usage.** Local dev mirrors production: link and sync ArcTracker data only after signing in with dev-auth.
- **Discord OAuth bridge and Cognito custom-auth triggers.** Dev auth is sub-only; the full federated flow still requires the real stack.
- **PITR, TTL eviction, customer-managed KMS at rest.** The local table has none of these. If you're testing behavior that depends on them, use the deployed stack.
- **Schema drift guardrails.** `infra/local/server.ts::ensureTable()` is hand-written to match `RaiderToolsStack.UserTable`. If you change the CDK table definition in `infra/lib/raider-tools-stack.ts`, update `ensureTable()` in the same PR.
- **Local route parity is manual.** If you add a new API Lambda or HTTP route in `infra/lib/raider-tools-stack.ts`, also register it in `infra/local/server.ts` in the same PR so the Vite + `local:api` workflow stays representative.
## File map (local-dev cheat sheet)
- `infra/local/docker-compose.yml` — DynamoDB Local container spec.
- `infra/local/server.ts` — Local HTTP server; dispatches to the real Lambda handlers.
- `infra/package.json` — `local:ddb`, `local:ddb:down`, `local:api`, `local:dev` scripts.
- `src/shared/auth/devAuthClient.ts` — Dev-mode session store + bearer-token generator.
- `src/shared/auth/cognitoClient.ts` — Delegates to `devAuthClient` when `VITE_DEV_AUTH=true`.
- `src/shared/context/CognitoAuthContext.tsx` — Adds `signInAsDevUser(sub, email?)` and a `devAuth` flag.
- `src/pages/SignIn.tsx` — Renders a "Sign in as dev user" panel when `devAuth` is true.
- `vite.config.ts` — Conditional `/me` proxy to `localhost:4000` in dev-auth mode.
- `infra/.env.example` — Template for local API server env vars loaded by `infra/local/server.ts`.
