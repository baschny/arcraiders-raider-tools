# Authentication
This document is the single entry point for future AI agents (and humans) working on anything that requires a **signed-in user**, changes how users sign in, or adds a new identity / social provider.

For anything that reads or writes **server-persisted user data**, read `docs/User-Data.md` instead; the two documents are intentionally split. They reference each other where the concerns overlap (envelope-encrypted linked-account tokens, sign-out orchestration, etc.).

For running sign-in locally against the dev-auth bypass (no Cognito, no Discord), read `docs/Local-Development.md`.

This document covers:
- The Cognito setup and how email/password + Discord sign-in work.
- The custom domain (`auth.raider-tools.app`) and its cross-region cert.
- The client-side auth API (`CognitoAuthContext`, `cognitoClient.ts`) and the sign-in / sign-up / callback pages.
- How to add a new JWT-protected endpoint.
- How to add a new identity provider (Discord-style bridge).
- Deployment.
- Restrictions and caveats for anything touching identity.

---
## 1. High-level architecture
```
Browser SPA (raider-tools.app)
  │
  ├─ amazon-cognito-identity-js              (identity)
  │      ├─ email + password sign-in/up         → Cognito native API
  │      └─ Discord-bridged custom-auth         → DiscordAuthFn + Cognito triggers
  │
  └─ Authenticated HTTPS (Bearer Cognito ID token)
         │
         ▼
   API Gateway HTTP API  (api.raider-tools.app)
         │   HttpJwtAuthorizer bound to User Pool
         │
         ├─ /auth/discord/start          →  DiscordAuthFn   (no JWT)
         ├─ /auth/discord/callback       →  DiscordAuthFn   (no JWT)
         └─ every authenticated /me* route (see docs/User-Data.md)
Cognito User Pool                       (eu-central-1)
  • signInAliases: { email: true }      → Cognito Username is an email
  • lambdaTriggers: DefineAuth/CreateAuth/VerifyAuth (custom-auth flow)
  • custom domain auth.raider-tools.app (served by CloudFront)
ACM certificate                         (us-east-1, cross-region reference)
Secrets Manager                         raider-tools/discord/oauth
  { clientId, clientSecret, stateSigningKey }      (populated post-deploy)
DynamoDB raider-tools-users
  • IDP#discord#<discord_id>  → cognitoUsername, sub
  • NONCE#<hex>               → single-use HMAC nonces (TTL evicted)
  (full data model in docs/User-Data.md)
```
Two stacks in `infra/` own everything auth-related:
- `RaiderToolsAuthCertStack` (us-east-1) — ACM cert for the Cognito custom domain (Cognito requires the cert in us-east-1 because it serves the domain via CloudFront).
- `RaiderToolsStack` (eu-central-1) — HTTP API + User Pool + User Pool Client + custom domain + custom-auth Lambdas + Discord bridge + `/me*` Lambdas + all API Gateway routes (data-layer pieces are covered in `User-Data.md`).

---
## 2. Authentication flows
### 2.1 Email + password (Cognito native)
1. SPA calls `signUp(email, password)` via `src/shared/auth/cognitoClient.ts`.
2. Cognito sends a verification code by email.
3. SPA calls `confirmSignUp(email, code)` → account status is `CONFIRMED`.
4. SPA calls `signIn(email, password)` → Cognito returns ID + access + refresh tokens. `amazon-cognito-identity-js` caches them in `localStorage` under its own keys.
5. On next page load, `getCurrentSession()` surfaces the existing session without a round-trip.

UI entry points:
- `src/pages/SignIn.tsx` — sign-in form + "Continue with Discord" button.
- `src/pages/SignUp.tsx` — two-step register → confirm-code flow.

### 2.2 Discord (Lambda bridge)
Cognito does not natively federate Discord, so we bridge via a custom-auth flow.

```
Browser                   DiscordAuthFn                Discord                Cognito
   │                           │                          │                      │
   │  GET /auth/discord/start ─►                          │                      │
   │                           │  302 authorize (prompt=none, HMAC state)       │
   │  302 ──────────────────────────────────────────────► │                      │
   │                           │                          │                      │
   │              (user authorizes if not silent)         │                      │
   │                           │                          │                      │
   │   302 /auth/discord/callback?code&state◄─────────────┤                      │
   │                           │                          │                      │
   │                           │  POST /oauth2/token      │                      │
   │                           ├──────────────────────────►                      │
   │                           │  access_token            │                      │
   │                           ◄──────────────────────────┤                      │
   │                           │  GET /users/@me          │                      │
   │                           ├──────────────────────────►                      │
   │                           │  {id, email, username}   │                      │
   │                           ◄──────────────────────────┤                      │
   │                           │                          │                      │
   │                           │  Lookup IDP#discord#<id> in DynamoDB            │
   │                           │  (create Cognito user on first sight)           │
   │                           │                                                 │
   │                           │  Put NONCE#<hex> + TTL                          │
   │                           │  AdminInitiateAuth(CUSTOM_AUTH)                 │
   │                           ├────────────────────────────────────────────────►│
   │                           │  AdminRespondToAuthChallenge("<nonce>.<hmac>")  │
   │                           ├────────────────────────────────────────────────►│
   │                           │             (Define/Create/Verify triggers run)│
   │                           │  id_token, refresh_token                       │
   │                           ◄────────────────────────────────────────────────┤
   │                           │                                                 │
   │   302 <spa>/auth/callback#id_token=...&refresh_token=... ◄───               │
   │                           │                                                 │
   │                           │                                                 │
   ├─ /auth/callback → acceptTokensFromHash() seeds the Cognito SDK session
```

Key properties:
- **`prompt=none`** on the outgoing Discord redirect makes it a silent re-auth for returning users. If Discord replies with `?error=consent_required` (or similar interaction errors), `DiscordAuthFn` catches it and bounces to `/auth/discord/start?consent=1`, which retries without `prompt=none` so the consent screen is shown **exactly once**.
- **HMAC-signed `state`** contains the return URL + a nonce + a timestamp. Signed with `stateSigningKey` from Secrets Manager, validated on the way back. 10-minute max age.
- **Cognito user creation**: `signInAliases: { email: true }` forces `Username` to be an email. We therefore call `AdminCreateUser` with `Username = email` (synthetic `discord-<id>@no-email.raider-tools.app` if Discord didn't grant the `email` scope). We read `created.User.Username` — that's the **internal UUID Cognito assigns** — and persist it as `cognitoUsername` in `IDP#discord#<id>`. All subsequent admin calls for that user use this UUID.
- **Nonce bridge**: `DiscordAuthFn` mints `nonce + hmac(nonce, stateSigningKey)` and puts a TTL row `NONCE#<nonce>` in DynamoDB pointing at `cognitoUsername`. The answer `"<nonce>.<hmac>"` is passed to `AdminRespondToAuthChallenge`. The `VerifyAuthChallengeResponse` Lambda trigger (`cognito-verify-auth.ts`) validates the HMAC, single-use deletes the nonce, and matches `event.userName` against the stored mapping.
- **Tokens in the fragment**: `DiscordAuthFn` redirects to `<spa>/auth/callback#id_token=...&refresh_token=...&expires_in=...`. The SPA consumes them in `CognitoAuthContext.useEffect` via `acceptTokensFromHash(...)`, then `history.replaceState` strips the fragment so tokens never appear in logs or history.

### 2.3 Session lifecycle
- `CognitoAuthProvider` (`src/shared/context/CognitoAuthContext.tsx`) is the single source of truth for identity. Components read `user`, `available`, `initializing`, and call `signInWithPassword`, `signUpWithPassword`, `confirmSignUp`, `startDiscordSignIn`, `signOut` via `useCognitoAuth()`.
- **Automatic token refresh**: always call `await getIdToken()` (in `src/shared/auth/cognitoClient.ts`) before making an authenticated request. It asks the Cognito SDK to refresh if close to expiry. Refresh tokens currently live 30 days; ID and access tokens 1 hour.
- **Sign-out is user-data aware**: `signOut()` fire-and-forget calls `runSignOutWipe()` (in `src/shared/state/hydration.ts`) **before** clearing Cognito tokens, so any pending authenticated writes can still fire. See `docs/User-Data.md` §5 for what the wipe does.
- **`initializing` is true only while Cognito itself is being resolved** (hash-token ingest, cached-session rehydrate). `available === false` means the build has no Cognito env vars, and the SPA runs fully in anonymous mode.

### 2.4 Custom domain (`auth.raider-tools.app`)
Cognito serves the custom domain via CloudFront, which means the ACM certificate **must live in us-east-1**. That is why we have a two-region setup:
- `RaiderToolsAuthCertStack` in us-east-1 provisions the cert against Route53 DNS validation.
- `RaiderToolsStack` in eu-central-1 consumes it via CDK's `crossRegionReferences: true`.
- A Route53 `A`-alias record points `auth.raider-tools.app` at Cognito's CloudFront distribution.

**Pre-deploy requirement**: the apex `raider-tools.app` must resolve (`dig +short raider-tools.app A`). Cognito refuses to create a subdomain if the parent zone has no apex record. The Amplify hosting record is sufficient.

First-time deploy takes **20–40 minutes** because Cognito is provisioning a new CloudFront distribution. Subsequent deploys are fast.

The custom domain currently serves only the Hosted UI, which the SPA does not use (we call Cognito APIs directly). The domain exists mainly for brand polish and future federation work.

---
## 3. Client-side auth API
### 3.1 `CognitoAuthContext` (`src/shared/context/CognitoAuthContext.tsx`)
```ts path=null start=null
const { user, available, initializing,
        signInWithPassword, signUpWithPassword, confirmSignUp,
        startDiscordSignIn, signOut } = useCognitoAuth();
```
- `user: AuthSession | null` — `{ idToken, accessToken, refreshToken, expiresAt, sub, email }`.
- `available` — `false` means Cognito is not configured in this build; your component must degrade gracefully and not gate features behind sign-in.
- `initializing` — `true` until any cached session is rehydrated. Render a spinner, not an auth screen, during this window.
- `startDiscordSignIn()` — navigates to `/auth/discord/start?return=<origin>`. The Discord bridge handles the rest and lands the user on `/auth/callback`.
- `signOut()` — triggers `runSignOutWipe()` then clears Cognito tokens locally. Does **not** revoke the refresh token server-side; if that becomes a requirement, implement it here.

### 3.2 `cognitoClient.ts` (`src/shared/auth/cognitoClient.ts`)
Thin wrapper around `amazon-cognito-identity-js`:
- `isCognitoConfigured()` — true when both `VITE_COGNITO_USER_POOL_ID` and `VITE_COGNITO_CLIENT_ID` are set.
- `signUp(email, password)` / `confirmSignUp(email, code)` / `resendConfirmationCode(email)`.
- `signIn(email, password)` — returns `AuthSession`.
- `getCurrentSession()` — rehydrates the last session from local cache, returns null if expired/missing.
- **`getIdToken()` — this is the function every authenticated API call must use.** It returns a fresh JWT or null. Do not hand-roll token lookups.
- `acceptTokensFromHash({ idToken, accessToken, refreshToken })` — used by the Discord callback page only.
- `signOut()` — clears Cognito's local cache (the context's `signOut` wraps this with `runSignOutWipe`).

### 3.3 Auth pages
- `src/pages/SignIn.tsx` — dual path (email/password + Discord). Guards `!cognito.available`, auto-redirects to `/settings/profile` if already signed in.
- `src/pages/SignUp.tsx` — two-stage: register → confirm with email code.
- `src/pages/AuthCallback.tsx` — consumes the hash fragment via `CognitoAuthContext`'s mount effect, then navigates to `/settings/profile`.
- `src/pages/Profile.tsx` — signed-in profile shell. Linked-account sections such as ArcTracker and Embark live under `src/pages/profile/` and are user-data concerns, not identity concerns.

---
## 4. Recipe: adding a new JWT-protected endpoint
Use this when you need a new `/me/*` or similar route that just needs authentication (no linked-account tokens, no per-user state sync — those have their own recipes in `docs/User-Data.md`).

1. **Lambda** — `infra/lambda/<name>.ts`. Use `APIGatewayProxyEventV2WithJWTAuthorizer` and the helpers in `infra/lambda/_lib/http.ts`:
   ```ts path=null start=null
   import { jsonResponse, pickAllowedOrigin, jwtSub } from './_lib/http';

   export async function handler(event) {
       const origin = pickAllowedOrigin(event);
       const sub = jwtSub(event);
       if (!sub) return jsonResponse(401, { error: 'Unauthenticated' }, origin);
       // … your logic …
   }
   ```
2. **CDK** — in `infra/lib/raider-tools-stack.ts`, use the private `makeLambda(...)` helper. Grant whatever IAM the handler needs (DynamoDB, KMS, Secrets Manager) through the existing constructs.
3. **Route** — attach via `props.httpApi.addRoutes({ path, methods, integration, authorizer: jwtAuthorizer })`. The authorizer (`CognitoJwtAuthorizer`) is already defined in that file; reuse it — do not create a new one.
4. **Client** — add a typed function in `src/shared/services/userApi.ts`. It must await `getIdToken()` and set `Authorization: Bearer <token>`.
5. **Tests** — see `docs/User-Data.md` §7 for the fetch-mock pattern; it applies to any new authenticated endpoint.

**Do not:**
- Validate JWTs inside the Lambda; the authorizer already does that, and event.requestContext.authorizer.jwt.claims is the trusted source.
- Mix authenticated and unauthenticated routes on the same Lambda path unless you guard on the claims explicitly (the authorizer runs only on routes that declare it).

---
## 5. Recipe: adding a new identity provider
Use this when you want a new sign-in mechanism (Twitch, GitHub, Epic — anything OAuth-like that isn't natively supported by Cognito's hosted federation).

If the provider also produces a long-lived token you want to store for later use (e.g. calling an API on the user's behalf), **read `docs/User-Data.md` §5.2** *in addition* to this recipe — token storage and envelope encryption live in that doc.

Important: not every OAuth flow belongs here. Embark is intentionally **not** a Raider Tools identity provider in the current architecture; it is a linked-account flow for already-authenticated users and is implemented under `/me/links/embark/*`. If the user must already be signed in with Cognito before starting the flow, that work belongs in `docs/User-Data.md`, not this section.

1. **Secrets Manager** — add a secret `raider-tools/<provider>/oauth` with `{ clientId, clientSecret, stateSigningKey }`. Populate post-deploy (see §7).
2. **Bridge Lambda** — create `infra/lambda/<provider>-auth.ts`. Mirror the structure of `discord-auth.ts`:
   - `GET /auth/<provider>/start` → signed-state redirect to the provider's `/authorize`.
   - `GET /auth/<provider>/callback` → exchange code, fetch profile, look up `IDP#<provider>#<external_id>` in DynamoDB, `AdminCreateUser` (Username = email) on first sight, mint nonce, run `AdminInitiateAuth(CUSTOM_AUTH)` + `AdminRespondToAuthChallenge`, 302 back to the SPA with tokens in the URL fragment.
3. **Cognito custom-auth triggers** — the existing `cognito-define-auth.ts` / `cognito-create-auth.ts` / `cognito-verify-auth.ts` are **generic** (they verify `<nonce>.<hmac>` against `stateSigningKey`). Reuse them. If your provider needs a different signing key, either share `stateSigningKey` across providers (easiest) or extend the verify trigger to try multiple keys.
4. **CDK** — wire the new Lambda in `RaiderToolsStack`, grant Secrets Manager read, DynamoDB R/W, and the same `cognito-idp:AdminCreate/Get/InitiateAuth/RespondToAuthChallenge/SetUserPassword/UpdateUserAttributes` actions that `discordAuthFn` has. Add two routes (`/auth/<provider>/start`, `/auth/<provider>/callback`) on `this.httpApi` — **no JWT authorizer**; these are pre-auth routes.
5. **Dev portal setup** — register the OAuth redirect URI `https://api.raider-tools.app/auth/<provider>/callback` in the provider's developer console.
6. **SPA** — add a `startSignInWith<Provider>()` helper in `CognitoAuthContext` that navigates to `/auth/<provider>/start?return=<origin>`, and a button in `SignIn.tsx`.
7. **AuthCallback** — the existing `/auth/callback` page consumes any `id_token + refresh_token + access_token` fragment regardless of provider. No changes needed.

**Do not:**
- Create a second Cognito user pool. A single pool per environment, always.
- Skip the `prompt=none` → `consent=1` fallback — without it, returning users see the consent screen on every sign-in.
- Store the provider's OAuth access/refresh tokens in `IDP#<provider>#<id>` rows. If the app needs them later, store them under `USER#<sub> / LINK#<provider>` using envelope encryption. See `docs/User-Data.md` §5.2.

---
## 6. Restrictions and caveats (non-negotiable)
- **Always use `getIdToken()`** before an authenticated call. Tokens live 1 h; hand-rolled caches break silently.
- **Never validate JWTs in application code.** API Gateway's `HttpJwtAuthorizer` is the only validator.
- **Never add OAuth callback URLs to a different domain than `api.raider-tools.app`.** The `DISCORD_REDIRECT_URI` env var is keyed on it, the provider's allowlist is keyed on it, and cross-domain redirects break the state-signing guarantee.
- **Signed state only.** Every OAuth bridge must sign the `state` param with a key in Secrets Manager. Reject any callback where the signature does not match.
- **Single-use nonces only.** Every custom-auth bridge must use a `NONCE#<hex>` row with a TTL. Never re-use a nonce, never accept one past the TTL.
- **Do not sign users in without consent.** `prompt=none` is acceptable for silent re-auth, but on error we must fall back to the full consent screen.
- **Do not alter the User Pool removal policy.** It is `RETAIN`. Accidentally deleting the pool wipes every user.
- **Do not change `signInAliases`** without also re-testing every admin call site. Going from `email` to `username` (or vice versa) changes what `AdminCreateUser` expects and what `event.userName` looks like in triggers.
- **Apex DNS record is required.** Without an `A`/`ALIAS` on `raider-tools.app`, the Cognito custom domain deploy fails with `InvalidParameterException`.
- **Tokens in the fragment, not the query string.** `DiscordAuthFn` redirects with `#id_token=...`, never `?id_token=...`. Anything that leaks into API Gateway logs is a breach risk.
- **`signOut()` must wipe user data first.** If you add new auth-related client caches, extend the wipe in `src/shared/state/hydration.ts` rather than piggybacking into `CognitoAuthContext.signOut`.
- **`amazon-cognito-identity-js` uses `localStorage` by default.** If you move tokens to cookies, update every fetch call in the codebase; do not mix storage strategies.

---
## 7. Deployment
```bash
cd infra
AWS_PROFILE=baschny npx cdk diff
AWS_PROFILE=baschny npx cdk deploy --all --require-approval never
```
Everything auth-related lives in `RaiderToolsStack` (eu-central-1). Cross-region cert changes (very rare) go via `RaiderToolsAuthCertStack` (us-east-1) — `--all` handles both. Both regions must be bootstrapped:
```bash
AWS_PROFILE=baschny cdk bootstrap aws://935743309611/eu-central-1
AWS_PROFILE=baschny cdk bootstrap aws://935743309611/us-east-1
```
Secrets that must be populated post-deploy:
```bash
AWS_PROFILE=baschny aws secretsmanager put-secret-value \
  --secret-id raider-tools/discord/oauth \
  --secret-string '{"clientId":"…","clientSecret":"…","stateSigningKey":"<base64-32-bytes>"}'
```
SPA env vars (required for anything beyond anonymous mode):
- `VITE_COGNITO_USER_POOL_ID`
- `VITE_COGNITO_CLIENT_ID`
- `VITE_API_BASE_URL=https://api.raider-tools.app`

Set these in the Amplify console for production and in `.env` for local dev. The SPA degrades to anonymous mode when any of them is missing.

---
## 8. File map (auth-specific cheat sheet)
Server / infra:
- `infra/lib/raider-tools-stack.ts` — unified eu-central-1 stack: HTTP API + custom domain, User Pool + custom domain, Cognito triggers, Discord bridge, all `/me*` routes (data endpoints detailed in User-Data.md).
- `infra/lib/raider-tools-auth-cert-stack.ts` — us-east-1 ACM cert for `auth.raider-tools.app`.
- `infra/lambda/discord-auth.ts` — Discord OAuth bridge (`/auth/discord/start`, `/auth/discord/callback`).
- `infra/lambda/cognito-define-auth.ts` — Cognito `DefineAuthChallenge` trigger.
- `infra/lambda/cognito-create-auth.ts` — Cognito `CreateAuthChallenge` trigger.
- `infra/lambda/cognito-verify-auth.ts` — Cognito `VerifyAuthChallengeResponse` trigger (validates `<nonce>.<hmac>`).
- `infra/lambda/_lib/http.ts` — `pickAllowedOrigin`, `jsonResponse`, `jwtSub`, `jwtEmail`, `parseJsonBody`.
- `infra/lambda/_lib/discordSecret.ts` — cached Secrets Manager loader for Discord creds.

Client:
- `src/shared/auth/cognitoClient.ts` — `amazon-cognito-identity-js` wrapper, `getIdToken()`, `acceptTokensFromHash()`.
- `src/shared/context/CognitoAuthContext.tsx` — identity provider, exposes `useCognitoAuth()`.
- `src/pages/SignIn.tsx`, `src/pages/SignUp.tsx`, `src/pages/AuthCallback.tsx` — auth UI.

Embark note:
- The Embark account-link flow is not part of Cognito identity. See `docs/User-Data.md`, `infra/lambda/embark-link.ts`, and `src/pages/profile/EmbarkSection.tsx`.
- `src/pages/ProfileSettings.tsx` — "Identity" section (sign-in state + sign-out button).

When in doubt: check the tests in `src/shared/state/__tests__/` — they mock the full sign-in flow end-to-end and are the canonical examples of what the client expects from the server.
