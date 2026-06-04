# Change: Craft Calculator — Game Data Sync & Auto-Fill

## Status
Proposed

## Summary
Add a sync header bar to the Craft Calculator (similar to Quartermaster's GlobalHeader) that lets signed-in users with a linked ArcTracker or Embark account sync their in-game stash and loadout data. Auto-populate "In Stash" fields from this cached data when a craftable item is selected, so calculations render immediately without manual data entry.

## Motivation
- **Eliminate manual entry**: currently users must type owned quantities for every item and every material, every time they select an item
- **Parity with Quartermaster**: the QM already syncs game data; Craft Calculator should reuse the same infrastructure
- **Better UX**: calculation results should appear immediately on item selection when game data is available

---

## Requirements

### R1 — Shared Stash + Loadout Aggregation Utility

**R1.1** — Create `src/shared/utils/inventoryAggregator.ts` with a single export:

```typescript
export function aggregateInventoryQuantities(
  cachedStash: CachedStash | null,
  cachedLoadout: CachedLoadout | null,
): Map<string, number>
```

Walks stash items and all loadout slots, sums quantities by `itemId`, returns a `Map<itemId, totalQuantity>`. Excludes null/empty `itemId` entries.

### R2 — Sync Header Component

**R2.1** — Create `src/apps/craft-calculator/components/SyncHeader.tsx`

ArcTracker mode shows: "Sync My Items" button + per-source timestamps ("Stash: {age}", "Loadout: {age}").

Embark mode shows: "Sync Game Data" button + single "Game Data Last Sync: {age}" timestamp.

Uses `formatAgeShort`, ticks every 15s.

### R3 — Craft Calculator Main App Wiring

**R3.1** — Modify `src/apps/craft-calculator/index.tsx`:
- Add auth checks via `useCognitoAuth()` and `useLinkedAccounts()`
- Detect `gameDataSource` from `getMe()` on mount
- Load cached stash/loadout from IndexedDB
- Sync handler: Embark → `syncEmbarkInventory()`, ArcTracker → `syncStashAllPages()` + `syncLoadout()`
- Show `SyncHeader` when signed in and linked; show `SignInNudge` otherwise

### R4 — Auto-Fill Stash Values

**R4.1** — Modify `CraftCalculator` to accept optional `cachedStash` / `cachedLoadout` props.

**R4.2** — On item selection, call `aggregateInventoryQuantities()` and auto-fill:
- `craftedInStash` → inventory count of the selected item
- Each material's `amountPossessed` → inventory count of that material

Users can override any value manually.

### R5 — Styling

Create `src/apps/craft-calculator/styles/_sync-header.scss` reusing Quartermaster's styling patterns with `cc-` prefix.

### R6 — i18n Keys

Add keys under `craftCalculator.syncHeader` in `en.json`.

---

## Files Changed

| File | Action |
|------|--------|
| `src/shared/utils/inventoryAggregator.ts` | New |
| `src/apps/craft-calculator/components/SyncHeader.tsx` | New |
| `src/apps/craft-calculator/styles/_sync-header.scss` | New |
| `src/apps/craft-calculator/styles/main.scss` | Modify |
| `src/apps/craft-calculator/index.tsx` | Modify |
| `src/apps/craft-calculator/components/CraftCalculator.tsx` | Modify |
| `src/shared/i18n/locales/en.json` | Modify |

## Out of Scope
- Syncing hideout, blueprints, projects, or quests
- A toggle between auto-fill and manual mode
- Persisting stash values across page navigation
