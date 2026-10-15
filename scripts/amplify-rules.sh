#!/usr/bin/env bash
# Rewrite and redirect rules of the Amplify app (raider-tools.app). amplify-rules.json in the repository
# root is the source of truth; Amplify replaces the whole rule list on every update, so the file always
# holds every rule, the SPA fallback (`/<*>` -> /index.html, 404-200) last. Rules match top to bottom.
#
#   scripts/amplify-rules.sh          show the difference between the live rules and the file
#   scripts/amplify-rules.sh apply    replace the live rules with the file (asks first)
#
# Apply redirects to new pages only after the build that contains those pages is deployed.
set -euo pipefail

APP_ID=d1lwpxvb4kuhme
REGION=eu-central-1
export AWS_PROFILE="${AWS_PROFILE:-baschny}"
cd "$(dirname "$0")/.."

live=$(aws amplify get-app --app-id "$APP_ID" --region "$REGION" --query 'app.customRules' --output json | jq -S .)
file=$(jq -S . amplify-rules.json)

if diff <(echo "$live") <(echo "$file") >/dev/null; then
  echo "Live rules match amplify-rules.json."
  exit 0
fi
diff -u --label live <(echo "$live") --label amplify-rules.json <(echo "$file") || true

[[ "${1:-}" == "apply" ]] || { echo; echo "Run with 'apply' to replace the live rules."; exit 0; }
read -r -p "Replace the live rules of $APP_ID with amplify-rules.json? [y/N] " answer
[[ "$answer" == "y" ]] || { echo "Aborted."; exit 1; }
aws amplify update-app --app-id "$APP_ID" --region "$REGION" --custom-rules "file://amplify-rules.json" --query 'app.customRules' --output json >/dev/null
echo "Applied $(jq length amplify-rules.json) rules."
