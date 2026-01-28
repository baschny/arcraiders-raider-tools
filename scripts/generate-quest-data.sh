#!/bin/bash
# Generate quest data JSON file for the quest tracker
# This script extracts quest metadata and detects blueprint rewards

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
QUESTS_DIR="$SCRIPT_DIR/../../arcraiders-data/quests"
OUTPUT_FILE="$SCRIPT_DIR/../public/quests/quest-data.json"

echo "Generating quest data from $QUESTS_DIR..."

# Generate quest data JSON
jq -s '
  map({
    id, 
    name: .name.en, 
    trader, 
    map: (.map // []),
    previousQuestIds: (.previousQuestIds // []), 
    nextQuestIds: (.nextQuestIds // []), 
    hasBlueprint: ((.rewardItemIds // []) | map(.itemId) | any(test("_blueprint$")))
  }) | 
  map(
    if .id == "ss1" then .previousQuestIds = ["map_dam_battleground"] + .previousQuestIds
    elif .id == "ss11" then .previousQuestIds = ["map_blue_gate"] + .previousQuestIds
    elif .id == "12_in_my_image" then .previousQuestIds = ["map_stella_montis"] + .previousQuestIds
    else .
    end
  ) | sort_by(.id)
' "$QUESTS_DIR"/*.json > "$OUTPUT_FILE"

QUEST_COUNT=$(jq 'length' "$OUTPUT_FILE")
BLUEPRINT_COUNT=$(jq 'map(select(.hasBlueprint)) | length' "$OUTPUT_FILE")
BLUEPRINT_IDS=$(jq -c 'map(select(.hasBlueprint) | .id)' "$OUTPUT_FILE")

echo "✓ Generated $OUTPUT_FILE"
echo "  Total quests: $QUEST_COUNT"
echo "  Blueprint quests: $BLUEPRINT_COUNT"
echo "  Blueprint quest IDs: $BLUEPRINT_IDS"
echo ""
echo "Quest data is ready in public/quests/quest-data.json"
