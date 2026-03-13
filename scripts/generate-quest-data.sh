#!/bin/bash
# Generate quest data JSON file for the quest tracker
# This script extracts quest metadata and detects blueprint rewards

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
QUESTS_DIR="$SCRIPT_DIR/../../arcraiders-data/quests"
OUTPUT_FILE="$SCRIPT_DIR/../public/data/quests/quest-data.json"
ITEMS_FILE="$SCRIPT_DIR/../public/data/items-loot-helper.json"

echo "Generating quest data from $QUESTS_DIR..."

if [ ! -f "$ITEMS_FILE" ]; then
  echo "Error: Required item data file not found: $ITEMS_FILE"
  echo "Run npm run generate:items-loot-helper first."
  exit 1
fi

# Generate quest data JSON
jq -s --slurpfile items "$ITEMS_FILE" '
  map({
    id, 
    name: .name.en, 
    trader, 
    map: (.map // []),
    previousQuestIds: (.previousQuestIds // []), 
    nextQuestIds: (.nextQuestIds // []), 
    hasBlueprint: ((.rewardItemIds // []) | map(.itemId) | any(test("_blueprint$"))),
    blueprintRewards: (
      (.rewardItemIds // [])
      | map(.itemId)
      | map(select(test("_blueprint$")))
      | map(
          . as $blueprintId
          | ($items[0] | map(select(.id == $blueprintId)) | first) as $item
          | {
              id: $blueprintId,
              name: ($item.name.en // $blueprintId),
              imageFilename: ($item.imageFilename // "")
            }
        )
    )
  }) | 
  map(
    if .id == "picking_up_the_pieces" then .previousQuestIds = ["map_dam_battleground"] + .previousQuestIds
    elif .id == "a_first_foothold" then .previousQuestIds = ["map_blue_gate"] + .previousQuestIds
    elif .id == "in_my_image" then .previousQuestIds = ["map_stella_montis"] + .previousQuestIds
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
echo "Quest data is ready in public/data/quests/quest-data.json"
