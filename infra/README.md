# Raider Tools – Infrastructure

This `infra/` project provisions the AWS resources for `raider-tools.app`. Two stacks in two regions, always deployed together:

- `RaiderToolsAuthCertStack` (**us-east-1**) – ACM certificate for the Cognito custom domain `auth.raider-tools.app`. Cognito requires this certificate to live in us-east-1 because it serves the domain via CloudFront.
- `RaiderToolsStack` (eu-central-1) – everything else: HTTP API at `api.raider-tools.app`, authenticated ArcTracker proxying, schedule services, Cognito user pool (using the custom domain), DynamoDB user table, KMS CMK, Discord OAuth bridge, and all `/me*`, `/me/state/*`, `/me/migrate` Lambdas + routes.

ArcTracker profile data requires a signed-in Raider Tools user. The SPA links a user's ArcTracker token through `/me/links/arctracker`, and ArcTracker-backed data sync runs through `/me/arctracker/{proxy+}` using the encrypted linked token server-side. The ArcTracker **app key** is never exposed in the browser.

Cross-stack references between the two stacks are wired via CDK's `crossRegionReferences: true` (no manual ARN copy/paste).

History: `RaiderToolsStack` merges two older stacks, `RaiderToolsArcRelayStack` and `RaiderToolsAuthStack`. The split was purely thematic and caused a silent foot-gun — routes added via `httpApi.addRoutes(...)` from the auth stack physically landed in the relay stack, so `cdk deploy` of only the auth stack quietly skipped new routes. The merged layout makes `cdk deploy --all` always sufficient.

See https://arctracker.io/developers/docs for complete documentation.

---

## a) AWS resources created by this infrastructure

The CDK stack (CloudFormation) creates the following resources in **eu-central-1**:

- ACM Certificate for `api.raider-tools.app` (DNS validated via Route53)
- API Gateway (HTTP API) for authenticated user endpoints and schedule endpoints
- Lambda functions (Node.js) that:
    - reads the ArcTracker app key from Secrets Manager
    - decrypt the signed-in user's linked ArcTracker token when needed
    - forward authorized requests to ArcTracker
    - passes through rate-limit headers
    - enforces an allowlist of routes
- API Gateway custom domain name `api.raider-tools.app`
- API mapping (custom domain → API stage)
- Route53 A record (alias) for `api.raider-tools.app` pointing to the API Gateway domain
- IAM permissions allowing the Lambda to read the Secrets Manager secret

External dependency (must already exist):

- Route53 hosted zone for `raider-tools.app`

---

## b) Manual steps required

### 1) Determine the hosted zone ID

```bash
AWS_PROFILE=baschny aws route53 list-hosted-zones \
  --query "HostedZones[?Name=='raider-tools.app.'].{Id:Id,Name:Name}" \
  --output table
```

Use the ID **without** the `/hostedzone/` prefix in `infra/bin/app.ts`.

---

### 2) Create the Secrets Manager secret for the ArcTracker app key

Create once:

```bash
AWS_PROFILE=baschny aws secretsmanager create-secret \
  --name "arctracker/appKey" \
  --description "ArcTracker application API key for raider-tools.app" \
  --secret-string "arc_k1_XXXXX"
```

---

### 3) Configure stack inputs

Edit `infra/bin/app.ts` and set:

- `hostedZoneId` → value from step 1
- `arcAppKeySecretName` → `arctracker/appKey`
- `allowedOrigin` → `https://raider-tools.app`

---

### 4) CDK bootstrap (one-time per account/region)

If not done yet, bootstrap **both** regions used by this project:

```bash
AWS_PROFILE=baschny cdk bootstrap aws://935743309611/eu-central-1
AWS_PROFILE=baschny cdk bootstrap aws://935743309611/us-east-1
```

The us-east-1 bootstrap is required for `RaiderToolsAuthCertStack` (the Cognito custom-domain certificate).

---

### 5) Deploy the infrastructure

```bash
cd infra
AWS_PROFILE=baschny npx cdk deploy --all --require-approval never
```

Always use `--all` (or both stack names explicitly). Deploying just `RaiderToolsStack` skips the us-east-1 cert stack; deploying just `RaiderToolsAuthCertStack` has no Lambdas to update.

---

## c) What to do if the API key changes

Update the existing secret value:

```bash
AWS_PROFILE=baschny aws secretsmanager put-secret-value \
  --secret-id "arctracker/appKey" \
  --secret-string "arc_k1_NEW_VALUE"
```

No infrastructure changes are required. The Lambda caches the secret per warm container; new containers will automatically pick up the new value.

To force immediate pickup everywhere, redeploy the Lambda (see below).

Optional verification:

```bash
AWS_PROFILE=baschny aws secretsmanager get-secret-value \
  --secret-id "arctracker/appKey" \
  --query SecretString \
  --output text
```

---

## d) How to redeploy the Lambda when code changes

Any change to ArcTracker forwarding or user proxy Lambda code is deployed via CDK:

```bash
cd infra
AWS_PROFILE=baschny cdk deploy
```

Helpful commands:

```bash
AWS_PROFILE=baschny cdk diff
AWS_PROFILE=baschny cdk deploy
```

---

## Smoke test

After deployment, test ArcTracker sync through the signed-in user proxy with a Cognito ID token for a user that has linked ArcTracker:

```bash
curl -i \
  -H "Authorization: Bearer COGNITO_ID_TOKEN_HERE" \
  https://api.raider-tools.app/me/arctracker/v2/user/profile
```

Expected result:

- HTTP `200 OK`
- JSON body
- Headers:
    - `X-RateLimit-Limit`
    - `X-RateLimit-Remaining`
    - `X-RateLimit-Reset`

---

## Notes

- Signed-in Raider Tools users access stored ArcTracker tokens through `/me/arctracker/{proxy+}`; that route decrypts the linked token server-side and uses the shared relay forwarding helper.
- Anonymous ArcTracker profile usage is intentionally unsupported.

---

## User accounts + per-user state (Cognito + Discord + DynamoDB + KMS)

These resources all live in the unified `RaiderToolsStack`:

- A **Cognito User Pool** (email + password, plus a Discord-bridged passwordless flow via custom-auth Lambda triggers).
- A **Cognito custom domain** at `auth.raider-tools.app`, backed by a us-east-1 ACM certificate provisioned by `RaiderToolsAuthCertStack` and wired in via cross-region references. A Route53 A-record alias is created automatically.
- A **DynamoDB single-table** `raider-tools-users` for profiles, IdP mappings, envelope-encrypted linked-account tokens, and per-user synced state (`STATE#*` rows).
- A **KMS CMK** (`alias/raider-tools/user-secrets`) used to envelope-encrypt linked-account tokens (currently ArcTracker; Embark in phase 2).
- A **Secrets Manager** secret `raider-tools/discord/oauth` with the Discord OAuth client id/secret + a HMAC state-signing key.
- Lambdas behind new routes on the shared HTTP API:
  - `GET /auth/discord/start`, `GET /auth/discord/callback` – Discord OAuth bridge (no JWT auth).
  - `GET|PATCH /me` – profile (Cognito JWT-protected).
  - `GET|PUT|DELETE /me/links/{provider}` – manage external account links (Cognito JWT-protected).
  - `GET /me/arctracker/{proxy+}` – call ArcTracker with the user's encrypted linked token (Cognito JWT-protected).
  - `GET|PUT|DELETE /me/state/{domain}`, `POST /me/migrate` – per-user synced state with optimistic concurrency (Cognito JWT-protected).

### Pre-deploy: apex-record requirement (Cognito custom domain)

Cognito refuses to create a custom domain if the **apex** of the parent zone (`raider-tools.app`) does not already resolve. Verify before `cdk deploy`:

```bash
dig +short raider-tools.app A
```

If empty, add an A or alias record at the apex (the Amplify hosting record is sufficient) before deploying. Otherwise the auth-stack deploy will fail with `InvalidParameterException: Custom domain is not a valid subdomain`.

> First-time creation of the Cognito custom domain takes **20–40 minutes** because Cognito provisions a CloudFront distribution behind the scenes.

### Post-deploy: populate the Discord OAuth secret

1. Create an application at https://discord.com/developers/applications.
2. In **OAuth2 → Redirects**, add: `https://api.raider-tools.app/auth/discord/callback`.
3. In **OAuth2 → Scopes**, no static config needed (we request `identify email` from the SPA flow).
4. Generate a 32-byte random key for HMAC-signing the `state` parameter:

   ```bash
   STATE_KEY=$(openssl rand -base64 32)
   ```

5. Populate the secret (this overwrites the placeholder created by CDK):

   ```bash
   AWS_PROFILE=baschny aws secretsmanager put-secret-value \
     --secret-id raider-tools/discord/oauth \
     --secret-string "{\"clientId\":\"<discord client id>\",\"clientSecret\":\"<discord client secret>\",\"stateSigningKey\":\"$STATE_KEY\"}"
   ```

### Post-deploy: populate the Embark OAuth/config values

The Embark-linked-account flow depends on three operational values:

- Secrets Manager secret `raider-tools/embark/oauth`
  - JSON field: `clientSecret`
- SSM parameter `/raider-tools/embark/manifest-id`
- SSM parameter `/raider-tools/embark/user-agent`

These are intentionally managed **outside CloudFormation** so later `cdk deploy --all` runs do not reset them to placeholders.

#### 1. Set the Embark OAuth client secret

```bash
AWS_PROFILE=baschny aws secretsmanager put-secret-value \
  --secret-id raider-tools/embark/oauth \
  --secret-string '{"clientSecret":"<embark client secret>"}'
```

#### 2. Create or update the Embark request-config parameters

```bash
AWS_PROFILE=baschny aws ssm put-parameter \
  --name /raider-tools/embark/manifest-id \
  --type String \
  --value "1668862126276720848" \
  --overwrite

AWS_PROFILE=baschny aws ssm put-parameter \
  --name /raider-tools/embark/user-agent \
  --type String \
  --value "PioneerGame/pioneer_1.13.x-CL-1067127 (http-legacy) Windows/10.0.26100.1.768.64bit" \
  --overwrite
```

#### 3. Verify the current values

```bash
AWS_PROFILE=baschny aws ssm get-parameter \
  --name /raider-tools/embark/manifest-id \
  --query Parameter.Value \
  --output text

AWS_PROFILE=baschny aws ssm get-parameter \
  --name /raider-tools/embark/user-agent \
  --query Parameter.Value \
  --output text
```

Operational note:

- New Lambda containers pick up the changed SSM values immediately.
- Warm Embark Lambda containers cache `manifestId` and `userAgent` for **60 seconds**, so a change can take up to about one minute to be reflected everywhere.
- Embark token refresh is intentionally not wired up. The upstream Embark auth server is currently broken for refresh-token use, despite the `offline` scope. Users must re-authenticate after token expiry until this is revisited after June 2026.
- The production Embark callback is extension-oriented and uses the loopback redirect `http://127.0.0.1:49174`. Local development keeps the default `http://127.0.0.1:49176`. When the extension is unavailable, the current operational fallback is to let the user continue and manually rewrite the callback URL domain/host using site-owner instructions.

### SPA environment variables

Add these to the Vite `.env` (and to AWS Amplify environment variables for production):

- `VITE_COGNITO_USER_POOL_ID` – from CDK output `RaiderToolsStack.UserPoolId`
- `VITE_COGNITO_CLIENT_ID` – from CDK output `RaiderToolsStack.UserPoolClientId`
- `VITE_API_BASE_URL=https://api.raider-tools.app`

Whenever the Cognito pool is recreated (e.g. stack rebuild), both values change and the Amplify build needs the new values before the next SPA deploy — otherwise sign-in fails silently against the old pool.

### Smoke tests

```bash
# Start the Discord flow (will 302 to discord.com/oauth2/authorize)
curl -i "https://api.raider-tools.app/auth/discord/start?return=https://raider-tools.app"

# Read your own profile (replace <ID_TOKEN> with a Cognito ID token from sign-in)
curl -i -H "Authorization: Bearer <ID_TOKEN>" https://api.raider-tools.app/me
```
