#!/bin/bash

# Script to generate Quartermaster item data from arcraiders-data repository

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Generating Quartermaster item data..."

# Run the TypeScript import script
npx tsx "$SCRIPT_DIR/quartermaster-import.ts"

echo "Quartermaster data generation complete."
