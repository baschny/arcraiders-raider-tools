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

Item and recipe data come from the shared game data (`public/data/game/`), generated from arc-data:

```bash
npm run generate:game-data
```

See `docs/Game-Data.md`.

---

*Originally developed as a standalone tool, now integrated into raider-tools.*
