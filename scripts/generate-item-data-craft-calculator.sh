#!/bin/bash

# Update Arc Raiders item data from the arcraiders-data repository
# This script copies the latest item JSON files into the public data directory

SOURCE_DIR="../arcraiders-data/items"
TARGET_DIR="public/data/craft-calculator"
LOCALES=("en" "de" "pt-BR" "es" "fr" "it" "ja" "ko-KR" "pl" "ru" "tr" "zh-CN" "zh-TW")

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Error: Source directory '$SOURCE_DIR' not found."
  echo "Make sure the arcraiders-data repository is cloned in the parent directory."
  exit 1
fi

mkdir -p "$TARGET_DIR"
echo "Generating localized craft calculator data from $SOURCE_DIR..."

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "Error: jq is not installed. Please install it to continue."
    exit 1
fi

for LOCALE in "${LOCALES[@]}"; do
  TARGET_FILE="$TARGET_DIR/items.$LOCALE.json"
  FALLBACK_LOCALE="en"
  if [ "$LOCALE" = "pt-BR" ]; then
    FALLBACK_LOCALE="pt"
  elif [ "$LOCALE" = "ko-KR" ]; then
    FALLBACK_LOCALE="ko"
  fi

  jq -n --arg locale "$LOCALE" --arg fallback "$FALLBACK_LOCALE" '
    reduce inputs as $item ({};
      . + {
        ($item.id): {
          id: $item.id,
          name: {
            value: ($item.name[$locale] // $item.name[$fallback] // $item.name.en),
            originalEn: $item.name.en
          },
          stackSize: ($item.stackSize // 1),
          value: $item.value,
          imageFilename: $item.imageFilename,
          isWeapon: $item.isWeapon,
          recipe: $item.recipe,
          upgradeCost: $item.upgradeCost,
          craftQuantity: ($item.craftQuantity // 1)
        }
      }
    )
  ' "$SOURCE_DIR"/*.json > "$TARGET_FILE"

  if [ $? -eq 0 ]; then
    echo "✓ $TARGET_FILE generated successfully!"
    ITEM_COUNT=$(jq 'length' "$TARGET_FILE")
    echo "  Total items ($LOCALE): $ITEM_COUNT"
  else
    echo "✗ Failed to generate $TARGET_FILE."
    exit 1
  fi
done
