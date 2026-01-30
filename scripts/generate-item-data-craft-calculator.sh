#!/bin/bash

# Update Arc Raiders item data from the arcraiders-data repository
# This script copies the latest item JSON files into the public data directory

SOURCE_DIR="../arcraiders-data/items"
TARGET_FILE="public/data/craft-calculator/items.json"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Error: Source directory '$SOURCE_DIR' not found."
  echo "Make sure the arcraiders-data repository is cloned in the parent directory."
  exit 1
fi

echo "Generating $TARGET_FILE from $SOURCE_DIR..."

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "Error: jq is not installed. Please install it to continue."
    exit 1
fi

# Combine all JSON files into a single object with item IDs as keys
# We only extract the fields we need to keep the file size manageable
jq -n '
  reduce inputs as $item ({}; 
    . + { 
      ($item.id): {
        id: $item.id,
        name: $item.name.en,
        stackSize: ($item.stackSize // 1),
        value: $item.value,
        imageFilename: $item.imageFilename,
        recipe: $item.recipe,
        upgradeCost: $item.upgradeCost
      }
    }
  )
' "$SOURCE_DIR"/*.json > "$TARGET_FILE"

if [ $? -eq 0 ]; then
  echo "✓ $TARGET_FILE generated successfully!"
  ITEM_COUNT=$(jq 'length' "$TARGET_FILE")
  echo "  Total items: $ITEM_COUNT"
else
  echo "✗ Failed to generate $TARGET_FILE."
  exit 1
fi
