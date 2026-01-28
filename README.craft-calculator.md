# Craft Calculator

A specialized calculator for ARC Raiders to help players optimize stash space when crafting. It calculates whether crafting a specific item will result in a net gain or loss of stash slots, taking into account stack sizes, current inventory, and recipe requirements.

![App Screenshot](../craft-calc/screenshot.png)

## Features

- **Stash Space Impact Analysis**: Instantly see if crafting an item will free up or consume more stash space.
- **Optimal Craft Amount**: Automatically calculates the exact number of items to craft to maximize stash space efficiency.
- **Visual Stash Graph**: View a breakdown of stash usage for every possible craft amount.
- **Multi-Material Support**: Handles complex recipes with multiple required items and varying stack sizes.
- **Incomplete Stack Integration**: Account for items you already have in your stash, including partially filled stacks.
- **Real-time Calculations**: Visual feedback and results update immediately as you adjust quantities.
- **Game-Accurate Data**: Uses stack sizes and item data from [arctracker.io](https://arctracker.io).

## How to Use

1. **Define the Target Item**:
   - Select or enter the item you want to craft.
   - Enter the number of these items you **already possess** (Incomplete Stack).
2. **Required Materials**:
   - Specify your **Current Amount** for that material.
3. **Analyze the Results**:
   - **Maximum Craftable**: Shows how many items you can make with your current materials.
   - **Stash Delta**: Displays the change in stash slots (e.g., "+2 slots freed").
   - **The Recommendation**: Follow the "Optimal Recommendation" to reach the most space-efficient stash state.

## Updating Game Data

The application relies on item data that can be synced from the [RaidTheory/arcraiders-data](https://github.com/RaidTheory/arcraiders-data) repository.

1. Ensure you have the `arcraiders-data` repository cloned in the same parent directory as this project.
2. Run the update script:
   ```bash
   npm run generate:crafting
   ```
   This will sync JSON definitions and regenerate the items database in `public/items.json`.

---

*Originally developed as a standalone tool, now integrated into raider-tools.*
