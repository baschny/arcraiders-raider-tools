#!/bin/bash

# Script to generate consolidated item data from arcraiders-data repository

SOURCE_DIR="../arcraiders-data/items"
DEST_DIR="./public/data"
LOCALES=("en" "de" "pt-BR")

echo "Generating consolidated item data..."

# Check if source directory exists
if [ ! -d "$SOURCE_DIR" ]; then
  echo "Error: Source directory $SOURCE_DIR does not exist"
  exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
  echo "Error: jq is not installed. Please install it first."
  exit 1
fi

# Create destination directory if it doesn't exist
mkdir -p "$DEST_DIR"

echo "Processing item files..."
for LOCALE in "${LOCALES[@]}"; do
  OUTPUT_FILE="$DEST_DIR/items-loot-helper.$LOCALE.json"
  FALLBACK_LOCALE="en"
  if [ "$LOCALE" = "pt-BR" ]; then
    FALLBACK_LOCALE="pt"
  fi

  jq -s --arg locale "$LOCALE" --arg fallback "$FALLBACK_LOCALE" '
    map({
      id,
      name: {
        value: (.name[$locale] // .name[$fallback] // .name.en),
        originalEn: .name.en
      },
      description: {
        en: (.description[$locale] // .description[$fallback] // .description.en // "")
      },
      type,
      rarity,
      value,
      weightKg,
      stackSize,
      recyclesInto,
      recipe,
      salvagesInto,
      upgradeCost,
      tier,
      imageFilename,
      isWeapon,
      foundIn: (
        if has("foundIn") and .foundIn != null then
          if (.foundIn | type) == "string" then
            (.foundIn | split(","))
          else
            .foundIn
          end
        else
          ["Unknown"]
        end
        | map(gsub("^\\s+|\\s+$"; ""))
        | map(select(. != ""))
        | (if length > 0 then . else ["Unknown"] end)
      )
    })
  ' "$SOURCE_DIR"/*.json > "$OUTPUT_FILE"

  ITEM_COUNT=$(jq 'length' "$OUTPUT_FILE")
  if [ "$ITEM_COUNT" -eq 0 ]; then
    echo "Error: No items were processed for locale $LOCALE"
    exit 1
  fi

  echo "Done! Generated $OUTPUT_FILE"
  echo "Total items ($LOCALE): $ITEM_COUNT"
done
