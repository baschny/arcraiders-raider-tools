# Raider Tools – ArcTracker Relay (Infrastructure)

This `infra/` project provisions a minimal serverless relay API for `raider-tools.app` to call `arctracker.io` securely without exposing the ArcTracker **app key** in the browser.

Mapping:
* Source (Relay API): `https://api.raider-tools.app/arctracker/<path>`
* Target (ArcTracker API): `https://arctracker.io/api/<path>`

See https://arctracker.io/developers/docs for complete documentation.

### Some examples

| **Call** | **Target** |
|----------|-------------|
| https://api.raider-tools.app/arctracker/api/items | https://arctracker.io/api/items |
| https://api.raider-tools.app/arctracker/api/v2/user/profile | https://arctracker.io/api/v2/user/profile |

---

## a) AWS resources created by this infrastructure

The CDK stack (CloudFormation) creates the following resources in **eu-central-1**:

- ACM Certificate for `api.raider-tools.app` (DNS validated via Route53)
- API Gateway (HTTP API) for the relay endpoints (e.g. `/arc/user/profile`)
- Lambda function (Node.js) that:
    - reads the ArcTracker app key from Secrets Manager
    - forwards the user’s `Authorization: Bearer ...` token to ArcTracker
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

If not done yet:

```bash
AWS_PROFILE=baschny cdk bootstrap aws://935743309611/eu-central-1
```

---

### 5) Deploy the infrastructure

```bash
cd infra
AWS_PROFILE=baschny cdk deploy
```

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

Any change to `infra/lambda/arc-relay.ts` is deployed via CDK:

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

After deployment, test the relay with a real user token:

```bash
curl -i \
  -H "Authorization: Bearer arc_u1_USER_TOKEN_HERE" \
  https://api.raider-tools.app/arctracker/v2/user/profile
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

- This relay intentionally does **not** store user tokens or user data server-side.
- API routes are **explicitly allowlisted**.
- Add new ArcTracker endpoints in both:
    - CDK routes (`httpApi.addRoutes(...)`)
    - Lambda route map (`ROUTE_MAP` in `arc-relay.ts`)
