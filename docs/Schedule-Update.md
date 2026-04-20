# Schedule Update Process
This document explains how schedule data is generated, which scripts are involved, which AWS automation runs it in production, and the dependencies that must stay healthy.

## Scope
The schedule pipeline produces and serves:
- `public/data/schedule/map-events.json` for local/static usage
- `map-events.json` and `health.json` in AWS S3 for the API relay endpoint

It is used by the Schedule app (`src/apps/schedule`).

## Local scripts (repository root)
Primary scripts:
- `scripts/generate-schedule-data-from-map-conditions.js`
  - Current source-of-truth generator
  - Scrapes `https://arcraiders.com/map-conditions` and per-condition pages
  - Uses `public/data/schedule/event-types.json` for event metadata/localization fallback
  - Merges recent past events from the previous output (30-day window) to avoid timeline gaps
  - Writes `public/data/schedule/map-events.json`
- `scripts/generate-schedule-data.js`
  - Legacy generator based on local `../embark-api/data/*` files
  - Kept as a fallback/reference, not used by the default npm schedule pipeline

NPM entry points:
- `npm run generate:schedule`
  - Runs:
    1. `npm run generate:maps-localizations`
    2. `npm run generate:map-events-localizations`
    3. `node ./scripts/generate-schedule-data-from-map-conditions.js`
- `npm run generate`
  - Includes `generate:schedule` as part of full data generation

## AWS automation (infra)
Defined in:
- `infra/lib/raider-tools-stack.ts`
- `infra/bin/app.ts`
- `infra/cdk.json`

Components:
- `ScheduleUpdateFunction` (Lambda, Node.js 22)
  - Source: `infra/lambda/schedule-updater.ts`
  - Scrapes map-conditions + fetches event types JSON
  - Reads previous schedule from S3 (merge window behavior)
  - Writes:
    - `map-events.json`
    - `staging/map-events.json`
    - `health.json`
- `ScheduleUpdaterHourlyRule` (EventBridge rule)
  - Triggers `ScheduleUpdateFunction` every hour (`rate(1 hour)`)
- `ScheduleReadFunction` (Lambda, Node.js 22)
  - Source: `infra/lambda/schedule-reader.ts`
  - Serves schedule files from S3
- API Gateway routes
  - `/schedule/map-events.json`
  - `/schedule/health.json`

## Runtime dependencies
External data/services:
- `https://arcraiders.com/map-conditions` (overview + per-condition pages)
- `https://raider-tools.app/data/schedule/event-types.json`

AWS resources:
- S3 schedule bucket (`ScheduleDataBucket`) with read/write from updater lambda
- EventBridge rule invoking updater lambda
- API Gateway + schedule-reader lambda for public read access via API endpoint

Node/package dependencies:
- Local script uses Node runtime APIs (`fetch`, file system)
- Infra lambda uses `@aws-sdk/client-s3`
- Infra deployment uses CDK (`aws-cdk-lib`, `constructs`, `aws-cdk`) and `ts-node` via `cdk.json`

Important environment variables (updater lambda):
- `MAP_CONDITIONS_URL`
- `EVENT_TYPES_URL`
- `SCHEDULE_BUCKET_NAME`
- `SCHEDULE_KEY`
- `SCHEDULE_STAGING_KEY`
- `SCHEDULE_HEALTH_KEY`
- `MERGE_HISTORY_WINDOW_SECONDS`

## Category assignment guardrail (important)
Map-condition detail pages can contain entries for multiple conditions. Category must be resolved from `entry.conditionName` using the overview map, not from the currently scraped page category.

This rule is implemented in both:
- `scripts/generate-schedule-data-from-map-conditions.js`
- `infra/lambda/schedule-updater.ts`

If major/minor suddenly mirror each other again, check this logic first.

## Update workflow
### 1) Local validation (optional but recommended)
From repository root:
```bash
npm run generate:schedule
```
Then confirm:
- `public/data/schedule/map-events.json` updates as expected
- major/minor tracks are not mirrored unexpectedly

### 2) Deploy updater changes to AWS
From repository root:
```bash
AWS_PROFILE=baschny npm --prefix ./infra run diff
AWS_PROFILE=baschny npm --prefix ./infra run deploy -- --all
```

### 3) Trigger/verify after deploy
Manual invoke:
```bash
FN_NAME=$(AWS_PROFILE=baschny aws cloudformation describe-stack-resources --stack-name RaiderToolsStack --query "StackResources[?LogicalResourceId=='ScheduleUpdateFunction'].PhysicalResourceId" --output text --no-cli-pager)
AWS_PROFILE=baschny aws lambda invoke --function-name "$FN_NAME" --payload '{}' /tmp/schedule-updater-response.json --no-cli-pager
```

Recent logs:
```bash
AWS_PROFILE=baschny aws logs tail "/aws/lambda/$FN_NAME" --since 10m --no-cli-pager
```

Public endpoints:
- `https://api.raider-tools.app/schedule/map-events.json`
- `https://api.raider-tools.app/schedule/health.json`

If MFA is required for the AWS profile, authenticate in a separate session before running deploy/invoke commands.
