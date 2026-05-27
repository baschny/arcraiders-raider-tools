# Change Request 19: Item Tooltip Improvements

**Status:** Draft  
**Date:** 2026-05-27

## Summary

Improve the item hover tooltip (modal overlay) in the "My Items" list and throughout the Quartermaster app. The improvements cover three areas: two-column layout separation of static vs. calculated information, enhanced "Needed for Lists" display with icons and quantity badges, and improved "Needed for Crafting" display with target item icons.

## Motivation

- Users need clearer visual separation between static item properties and calculated planning data
- The "Needed for Lists" section doesn't visually indicate whether items come from user lists or hideout, and the quantity display is inconsistent with the rest of the UI
- The "Needed for Crafting" section places the COMPLETE/NEEDED badge below the content instead of aligned to the right, and the crafting chain display is premature

## Requirements

### 1. Two-Column Layout

- **Header area**: Stays at the top with icon, name, type badge, rarity badge, and backpack owned-quantity pill. Followed by a horizontal separator line.
- **Column 1 (left, always present)**: Description text, properties (stack size, weight, value), crafting recipe, recycling information, salvage information.
- **Column 2 (right, optional)**: Appears only when the item has calculated/planning information: "Needed for Lists" and/or "Needed for Crafting". If no such data exists, the tooltip uses a single-column layout.

### 2. Needed for Lists Improvements

- Each list entry shows: `<icon> <listName>` on the left side.
  - The icon is `<List>` (from lucide-react) for user lists, `<Home>` for hideout lists.
  - The icon maps to the same icons used in the quartermaster sidebar navigation.
- Next to the list name: a quantity badge styled like `crafting-view__material-qty` showing the amount needed.
- On the right side: either a "COMPLETE" badge (green, same as current) OR a "`<qty>` NEEDED" badge.
  - The NEEDED badge should be red with white text, styled like `in-raid-view__missing-circle` (red background, white text, rounded pill shape).
  - The `<qty>` is the missing quantity for this item in this list.

### 3. Needed for Crafting Improvements

- Each crafting entry shows: `<icon> <listName>` as the list identifier (same icon logic as Needed for Lists). No quantities on this line.
- Below the list name: the goal/target item, prefixed with a small item icon (24px) with the item's rarity border/color and background image (matching `qm-item-tooltip__material-icon` styling).
- The "COMPLETE" or "NEEDED" badge is on the right side of the combined list-name + goal-item block (currently it's incorrectly placed below).
- **Remove** the crafting chain display (`chainLabel`) for now — it will be improved in a future change.

## Data Changes

### RequiredSource type enhancement

Add `listType` to `RequiredSource` to propagate the list origin:

```typescript
export interface RequiredSource {
  listId: string;
  listName: string;
  quantity: number;
  listType: 'user' | 'hideout';  // NEW
  impactedTargetItemIds?: string[];
}
```

### ItemFinalListNeed enhancement

Add `listType` so the tooltip can choose the correct icon:

```typescript
export interface ItemFinalListNeed {
  listId: string;
  listName: string;
  quantity: number;
  listType: 'user' | 'hideout';  // NEW
  isComplete: boolean;
}
```

### ItemCraftingNeed enhancement

Add `listType` for icon selection. Add `targetItemRarity` for the icon styling:

```typescript
export interface ItemCraftingNeed {
  listId: string;
  listName: string;
  listType: 'user' | 'hideout';  // NEW
  targetItemId: string;
  targetItemName: string;
  targetItemRarity: string;       // NEW (for icon rarity class)
  chainItemIds: string[];         // KEPT for data but not rendered
  chainLabel: string;             // KEPT for data but not rendered (REMOVED from UI)
  isComplete: boolean;
}
```

### Missing quantity propagation

For the "`<qty>` NEEDED" badge, the tooltip needs to know the missing quantity per list entry. Currently `isComplete` is a boolean per-entry, which is insufficient. We need a `missing` field:

```typescript
export interface ItemFinalListNeed {
  listId: string;
  listName: string;
  quantity: number;
  listType: 'user' | 'hideout';
  missing: number;    // NEW: missing amount for this specific list entry
  isComplete: boolean; // Derived: missing <= 0
}
```

## Affected Files

| File | Change |
|------|--------|
| `docs/specifications/quartermaster/specification-quartermaster.md` | Update tooltip section |
| `src/apps/quartermaster/types/planner.ts` | Add `listType` to `RequiredSource` |
| `src/apps/quartermaster/types/item.ts` | (check if PlannerItem has rarity) |
| `src/apps/quartermaster/utils/planner/aggregation.ts` | Propagate `listType` into `RequiredSource` |
| `src/apps/quartermaster/utils/itemInsights.ts` | Propagate `listType`, `missing`, and `targetItemRarity` to insight types |
| `src/apps/quartermaster/components/ItemTooltip.tsx` | Full redesign per requirements |
| `src/apps/quartermaster/styles/_item-tooltip.scss` | Two-column layout, new badge styles, updated crafting section |

## Test Considerations

- Verify two-column layout appears correctly when planning data exists
- Verify single-column layout when no planning data exists
- Verify icon selection (List vs Home) for hideout vs user lists
- Verify quantity badge styling matches `crafting-view__material-qty`
- Verify NEEDED badge styling matches `in-raid-view__missing-circle`
- Verify crafting chain is not rendered
- Run `npm run build` to verify compilation