#!/bin/bash
# Generate quest data JSON file for the quest tracker
# This script extracts quest metadata and detects blueprint rewards

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
QUESTS_DIR="$SCRIPT_DIR/../../arcraiders-data/quests"
OUTPUT_FILE="$SCRIPT_DIR/../public/data/quests/quest-data.json"
OUTPUT_DIR="$SCRIPT_DIR/../public/data/quests"
ITEMS_DIR="$SCRIPT_DIR/../public/data"

echo "Generating quest data from $QUESTS_DIR..."

if [ ! -f "$ITEMS_DIR/items/items.en.json" ]; then
  echo "Error: Required item data file not found: $ITEMS_DIR/items/items.en.json"
  echo "Run npm run generate:items first."
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

for LOCALE in "${LOCALES[@]}"; do
  OUTPUT_FILE="$OUTPUT_DIR/quest-data.$LOCALE.json"
  ITEMS_FILE="$ITEMS_DIR/items/items.$LOCALE.json"
  FALLBACK_LOCALE="en"
  if [ "$LOCALE" = "pt-BR" ]; then
    FALLBACK_LOCALE="pt"
  elif [ "$LOCALE" = "ko-KR" ]; then
    FALLBACK_LOCALE="ko"
  fi

  jq -s --arg locale "$LOCALE" --arg fallback "$FALLBACK_LOCALE" --slurpfile items "$ITEMS_FILE" '
    def resolveItemList(input):
      (input // [])
      | map(select(. != null and (.itemId // "") != ""))
      | map(
          . as $entry
          | $items[0].items[$entry.itemId] as $item
          | {
              id: $entry.itemId,
              quantity: ($entry.quantity // 1),
              name: {
                value: ($item.name.value // $entry.itemId),
                originalEn: ($item.name.originalEn // $entry.itemId)
              },
              rarity: ($item.rarity // "Common"),
              imageFilename: ($item.imageFilename // "")
            }
        );
    map({
      id,
      name: {
        value: (.name[$locale] // .name[$fallback] // .name.en),
        originalEn: .name.en
      },
      trader,
      map: (.map // []),
      previousQuestIds: (.previousQuestIds // []),
      nextQuestIds: (.nextQuestIds // []),
      description: {
        value: ((.description // {})[$locale] // (.description // {})[$fallback] // (.description // {}).en // ""),
        originalEn: ((.description // {}).en // "")
      },
      objectives: (
        (.objectives // [])
        | map({
            value: (.[$locale] // .[$fallback] // .en // ""),
            originalEn: (.en // "")
          })
      ),
      objectivesOneRound: (.objectivesOneRound // false),
      otherRequirements: (.otherRequirements // []),
      grantedItems: resolveItemList(.grantedItemIds),
      requiredItems: resolveItemList(.requiredItemIds),
      rewardItems: resolveItemList(.rewardItemIds),
      hasBlueprint: (
        (.rewardItemIds // [])
        | map(select(. != null))
        | map(.itemId // empty)
        | any(test("_blueprint$"))
      ),
      blueprintRewards: (
        (.rewardItemIds // [])
        | map(select(. != null))
        | map(.itemId // empty)
        | map(select(test("_blueprint$")))
        | map(
            . as $blueprintId
            | $items[0].items[$blueprintId] as $item
            | {
                id: $blueprintId,
                name: {
                  value: ($item.name.value // $blueprintId),
                  originalEn: ($item.name.originalEn // $blueprintId)
                },
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
  echo "  Total quests ($LOCALE): $QUEST_COUNT"
  echo "  Blueprint quests: $BLUEPRINT_COUNT"
  echo "  Blueprint quest IDs: $BLUEPRINT_IDS"
done
