# Change: Shared Item Icon Component & Styling

## Status
Proposed

## Summary
Centralize item icon rendering across all apps into a shared `ItemIcon` component with unified SCSS. Current state: each app reinvents icon rendering, craft-calculator has no rarity support, two different legendary color palettes exist, and the `getRarityClass` function is duplicated 4+ times. This change creates a canonical shared component and SCSS partial, then migrates craft-calculator, quests, and quartermaster to use it.

## Motivation
- **Consistency**: item icons look different across apps (craft-calc uses plain dark backgrounds, quests/quartermaster use rarity borders + gradient backgrounds, loot-helper uses a different legendary color from everyone else)
- **Reduce duplication**: rarity SCSS rules (5× `.rarity-*` blocks with `border-color` + `background-image`) are copy-pasted across 5+ files
- **Enable rarity in craft-calculator**: upstream data has `rarity` on every item but the generator strips it
- **Foundation for future components**: a canonical `ItemIcon` lets new features render items without reinventing the wheel
- **Blueprint icons lack rarity styling**: quests' blueprint dropdown shows raw icons with no rarity treatment

---

## Requirements

### R1 — Shared Rarity Infrastructure

**R1.1 — Unify rarity colors in `src/shared/styles/_variables.scss`**
- Add `$rarity-*-border` variables using the quartermaster/quests palette (already used by 2 of 3 active apps):
  - `$rarity-common-border: #9e9e9e`
  - `$rarity-uncommon-border: #4caf50`
  - `$rarity-rare-border: #2196f3`
  - `$rarity-epic-border: #9c27b0`
  - `$rarity-legendary-border: #ff9800`
- Keep existing `$rarity-*` variables (`#ffd700` legendary, etc.) unchanged for loot-helper backward compatibility (loot-helper is being deprecated and left as-is)

**R1.2 — Add blueprint rarity background image**
- Download `https://cdn.arctracker.io/items/blueprint_bg.png` → `public/images/rarities/blueprint_bg.png`
- This is a special background texture for blueprint items (all `rarity: "Common"` but visually distinct)

**R1.3 — Shared `ItemRarity` type in `src/shared/types/item.ts`**
```typescript
export type ItemRarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
```
- Quartermaster's `ItemRarity` and quests' `QuestItemRarity` should re-export from this shared type

**R1.4 — Shared `rarity.ts` utilities in `src/shared/utils/rarity.ts`**
```typescript
import type { ItemRarity } from '../types/item';

const VALID_RARITIES: Set<string> = new Set(['common', 'uncommon', 'rare', 'epic', 'legendary']);

/** Normalize any rarity input into a canonical ItemRarity. Falls back to 'Common'. */
export function normalizeItemRarity(value: string | null | undefined): ItemRarity {
  if (!value) return 'Common';
  const lower = value.toLowerCase().trim();
  if (VALID_RARITIES.has(lower)) {
    return (lower.charAt(0).toUpperCase() + lower.slice(1)) as ItemRarity;
  }
  return 'Common';
}

/** Return a `rarity-<lowercase>` CSS class suffix. Accepts any string, normalizes internally. */
export function getRarityClass(rarity: string | null | undefined): string {
  return `rarity-${normalizeItemRarity(rarity).toLowerCase()}`;
}
```
- `getRarityClass` is intentionally lenient: accepts `'Common'`, `'common'`, `null`, `undefined`, or unknown strings. Normalizes to a valid class name.
- Replace all inline implementations in quartermaster (`ItemIcon.tsx:72`, `ItemTooltip.tsx:27-29`) and quests (`QuestTooltip.tsx:19-21`) with imports from this shared utility
- Loot-helper is **not** modified — kept as-is per deprecation

**R1.5 — Shared SCSS partial `src/shared/styles/_item-icon.scss`**
- Base `.item-icon` block: `display: flex; flex-direction: column; align-items: center; gap: $spacing-xs`
- Container `.item-icon__container`: `position: relative; border-radius: $radius-sm; border: $border-width-default solid $border-default; background-size: cover; background-position: center; overflow: hidden; width: var(--item-icon-size, 56px); height: var(--item-icon-size, 56px)` — sizing via CSS custom property so apps can override without inventing extra size variants
- Image `.item-icon__image`: `width: 100%; height: 100%; object-fit: contain; padding: var(--item-icon-padding, 4px)`
- Name `.item-icon__name`: `font-size: $font-sm; color: $text-primary; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`
- Quantity badge `.item-icon__quantity`: absolute positioned bottom-right, `background: rgba(0, 0, 0, 0.75); color: $text-primary; font-size: 11px; font-weight: 600; padding: 1px 5px; border-radius: 3px`
- Quantity unknown `.item-icon__quantity--unknown`: `color: #a6a6a6; font-weight: 500` (for `null` quantities)
- Blueprint variant: `.item-icon--blueprint .item-icon__container` uses `background-image: url('/images/rarities/blueprint_bg.png'); border-color: $rarity-common-border`
- Rarity variants: 5× `.rarity-* .item-icon__container` blocks setting `border-color: $rarity-*-border` + `background-image: url('/images/rarities/*_bg.png')`
- Clickable variant: `.item-icon--clickable` with `cursor: pointer; user-select: none` + `&:hover .item-icon__container { border-color: $text-accent; }` + `&:focus-visible { outline: 2px solid $text-accent; outline-offset: 2px; border-radius: $radius-sm; }`
- **Import location**: imported via `@use 'item-icon';` in `src/shared/styles/main.scss` so it's available globally
- Apps that need to override sizes per-use do so via CSS custom properties on the parent, not by duplicating the shared partial

### R2 — Shared `ItemIcon` Component

**R2.1 — Create `src/shared/components/ItemIcon.tsx`** with props:
```typescript
interface ItemIconProps {
  itemId: string;
  name: string;
  icon?: string | null;               // nullable — some items have no image
  rarity?: string | null;              // lenient — normalized via normalizeItemRarity
  quantity?: number | null;            // null displays "?" badge
  showName?: boolean;                  // default true
  showQuantity?: boolean;              // default false
  isBlueprint?: boolean;              // default false — applies blueprint background variant
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;          // slot for app-specific overlays (badges, star, lock, etc.)
}
```
- `showName` defaults to `true`, `showQuantity` defaults to `false`
- Normalizes rarity via `normalizeItemRarity(rarity)` internally
- Renders a `<div>` with:
  - `className={`item-icon ${getRarityClass(rarity)} ${isBlueprint ? 'item-icon--blueprint' : ''} ${onClick ? 'item-icon--clickable' : ''} ${className ?? ''}`}`
  - `role={onClick ? 'button' : undefined}`
  - `tabIndex={onClick ? 0 : undefined}`
  - `onClick={onClick}`
  - `onKeyDown` handler for Enter/Space when clickable
  - `data-rarity={normalizeItemRarity(rarity).toLowerCase()}`
- No inline styles — all styling in SCSS
- `children` renders inside the container, allowing quartermaster to inject its badges/prioritize/lock without reimplementing the container
- When `icon` is missing/null, renders an empty container (same structure, just no `<img>`)

**R2.2 — Quantity badge behavior (per-app usage rules)**
- **Craft calculator**: `showQuantity={false}` — quantities are labeled inline in text next to the icon
- **Quests tooltip**: `showQuantity={item.quantity > 1}` — only show quantity badge when amount exceeds 1
- **Quartermaster**: `showQuantity={true}` — quantity is core owned-count UI; `null` → displays `?`
- **Quartermaster wrapping**: quartermaster's `ItemIcon.tsx` controls its own quantity rendering via `children`, not via the shared component's `showQuantity` — to avoid duplicate badges

**R2.3 — Export from `src/shared/components/`**
- Named exports: `ItemIcon`, `ItemIconProps`
- Re-exports: `ItemRarity` (from `shared/types/item`), `getRarityClass`, `normalizeItemRarity` (from `shared/utils/rarity`)

---

### R3 — Craft Calculator Migration

**R3.1 — Add `rarity` to craft-calculator data pipeline**
- Update `scripts/generate-item-data-craft-calculator.sh`: add `rarity: ($item.rarity // "Common")` to the jq filter output
- Update `src/apps/craft-calculator/types/item.ts`: add `rarity?: string` to `Item` and `LocalizedItem` interfaces
- Update `src/apps/craft-calculator/utils/itemData.ts`: pass through `rarity` in the `loadItems()` mapping

**R3.2 — Add `rarity` to `RequiredItemWithName` in `CraftCalculator.tsx`**
- Add `rarity?: string` field to `RequiredItemWithName` interface
- In the material mapping (line 56-68): add `rarity: materialItem?.rarity`
- This ensures required items can render with the shared icon's rarity styling

**R3.3 — Search auto-complete dropdown (`ItemSearch.tsx` line 103-104)**
- Replace raw `<img className="item-icon">` with `<ItemIcon itemId={item.id} name={item.name} icon={item.imageFilename} rarity={item.rarity} showName={false} />`
- Remove `.item-icon` rules from `_item-search.scss` (lines 56-63) — now provided by shared SCSS

**R3.4 — Crafted Item cell (`CraftCalculator.tsx` line 135-139)**
- Replace `<img className="selected-item-image">` with `<ItemIcon itemId={...} name={...} icon={...} rarity={...} showName={false} />`
- Remove `.selected-item-image` rules from `_calculator.scss` (lines 36-43)
- Container size: default 56px (matches shared `--item-icon-size` default)

**R3.5 — Required Items list (`CraftCalculator.tsx` line 198-208)**
- Replace inline-styled `<img>` with `<ItemIcon itemId={...} name={...} icon={...} rarity={...} showName={false} style={{ '--item-icon-size': '40px' } as React.CSSProperties} />`
- This increases icon size from 24px to 40px while keeping the existing inline text label layout

**R3.6 — UpgradeBreakdown material icons (`UpgradeBreakdown.tsx` line 67-73)**
- Replace `<img className="material-icon">` with `<ItemIcon itemId={row.materialId} name={row.materialName} icon={row.imageUrl} rarity={row.rarity} showName={false} style={{ '--item-icon-size': '24px' } as React.CSSProperties} />`
  - Add `rarity?: string` to the `materialRows` mapped data (from `material?.rarity`)
- Remove `.material-icon` rules from `_upgrade-breakdown.scss` (lines 107-115)

**R3.7 — Remove colliding SCSS**
- `_item-search.scss`: remove `.item-icon` block (lines 56-63) — the class now comes from shared
- `_calculator.scss`: remove `.selected-item-image` block (lines 36-43) and the `img` rule inside `.required-item .item-header` (line 130-132)
- `_upgrade-breakdown.scss`: remove `.material-icon` block (lines 107-115)

---

### R4 — Quest Tracker Migration

**R4.1 — Quest tooltip item tiles (`QuestTooltip.tsx`)**
- Replace `QuestItemTile` local component with shared `<ItemIcon>`
- Size: `style={{ '--item-icon-size': '64px' } as React.CSSProperties}` (matches current 64px container)
- `showName={true}`, `showQuantity={item.quantity > 1}` (per R2.2)
- Remove the `QuestItemTile` function entirely (lines 23-44)
- Remove the local `rarityClass()` function (line 19-21) — use shared import

**R4.2 — Blueprint dropdown icons (`BlueprintRewardsOverlay.tsx` line 79-85)**
- Replace raw `<img>` with `<ItemIcon itemId={entry.blueprintId} name={entry.blueprintName} icon={entry.blueprintImageFilename} rarity="Common" isBlueprint={true} showName={false} showQuantity={false} style={{ '--item-icon-size': '26px' } as React.CSSProperties} />`
- `rarity="Common"` is hardcoded — all blueprints are Common; the blueprint background texture distinguishes them visually
- `isBlueprint={true}` applies the `item-icon--blueprint` class which uses `blueprint_bg.png` background
- Do **not** add `rarity` to `BlueprintRewardListEntry` — the value is constant, no data plumbing needed
- Remove `.blueprint-overlay-item-icon` raw icon rules from `_blueprint-overlay.scss` (lines 82-88)

**R4.3 — Remove local rarity SCSS from tooltip**
- Remove local `$rarity-*-border` variable definitions from `_quest-tooltip.scss` (lines 6-10) — no longer referenced after migration
- Remove `QuestItemTile` SCSS block (lines 242-324) — all rarity styling now comes from shared `_item-icon.scss` (globally available via `src/main.tsx` → `shared/styles/main.scss`)
- Keep the `.quest-tooltip__tiles` layout wrapper (line 235-239) — it just positions the `<ItemIcon>` elements
- No additional `@use` needed — shared `_item-icon.scss` classes are globally available

**R4.4 — Update quest types**
- `src/apps/quests/types/quest.ts`: change `QuestItemRarity` to a re-export from `src/shared/types/item`

**R4.5 — Quest data generator: no changes needed**
- The generator (`scripts/generate-quest-data.sh`) includes `rarity` in `resolveItemList()` (line 48) for required/granted/reward items
- `blueprintRewards` (line 84-101) currently emits only `id`, `name`, and `imageFilename` — does **not** include rarity
- No generator change needed: `BlueprintRewardsOverlay.tsx` sets `rarity="Common"` directly on the `<ItemIcon>` component (all blueprints are Common with `isBlueprint={true}` for the blueprint background texture)
- Do **not** add `rarity` to `BlueprintReward` or `BlueprintRewardListEntry` — it's unnecessary since the value is constant

---

### R5 — Quartermaster Refactor

**R5.1 — Alias shared component on import**
- Import as `SharedItemIcon` to avoid confusion with the existing `src/apps/quartermaster/components/ItemIcon.tsx`:
  ```tsx
  import { ItemIcon as SharedItemIcon } from '../../../shared/components/ItemIcon';
  ```

**R5.2 — Refactor quartermaster `ItemIcon.tsx` to wrap the shared component**
- The quartermaster `ItemIcon` keeps all its app-specific behavior (badges, tooltip, prioritize, lock, insights, hover intent) but delegates the **visual rendering** of the icon container/image/name to `<SharedItemIcon>` via its `children` prop:
  ```tsx
  <SharedItemIcon
    itemId={itemId} name={name} icon={icon} rarity={rarity}
    showName={showName}
    style={{ '--item-icon-size': sizePx }}  // map size prop to CSS custom property
    onClick={onClick}
    className={...}
  >
    {/* Quartermaster-specific overlays rendered inside the container */}
    {canPrioritize && <StarButton />}
    {showRedLock && <LockIcon />}
    {showQuantity && <QuantityBadge />}
    {sortedBadges.length > 0 && <BadgeList />}
  </SharedItemIcon>
  ```
- Map quartermaster's `size` prop to CSS custom property `--item-icon-size`:
  - `xs` → `'30px'`
  - `sm` → `'80px'` (quartermaster's current sm, not the shared default)
  - `md` → `'84px'`
  - `lg` → `'108px'`
- Remove the local `rarityClass` computation (line 72) — use shared `getRarityClass()`
- Remove the local container/image/name rendering (lines 162-209) — delegated to shared component
- Keep all hover intent, tooltip positioning, and click handling logic

**R5.3 — Remove quartermaster container/image/name SCSS from `_item-icon.scss`**
- `_item-icon.scss` should `@use '../../../shared/styles/item-icon'` and only keep quartermaster-specific overrides:
  - Badge styles (`.item-icon__badges`, `.item-icon__badge`, badge variants)
  - Prioritize star (`.item-icon__prioritize`, hover, active states)
  - Lock icon (`.item-icon__lock`)
  - In-raid view multiline name override (lines 155-162)
- Remove: container (lines 9-18), image (lines 20-25), name base (lines 145-153), rarity variants (lines 211-235), size variants (lines 166-209)

**R5.4 — Migrate Quartermaster ItemTooltip icons to shared component**
- Main tooltip icon (`ItemTooltip.tsx` line 106-109): replace `<img>` with:
  ```tsx
  <SharedItemIcon itemId={item.id} name={item.name} icon={item.icon} rarity={item.rarity} showName={false} className="qm-item-tooltip__icon" />
  ```
  - `className` is now on the outer `.item-icon` div, NOT on an `<img>`. Existing SCSS selectors targeting `.qm-item-tooltip__icon` must be updated:
    ```scss
    .qm-item-tooltip__icon {
      --item-icon-size: 80px;   // set size via custom property (was: width/height on <img>)
    }
    ```
  - Remove individual `width`/`height`/`object-fit` rules that targeted `<img>` — sizing is now via `--item-icon-size`
- Material icons (lines 217, 246, 270): replace each `<img>` with:
  ```tsx
  <SharedItemIcon itemId={materialId} name={material.name} icon={material.icon} rarity={material.rarity} showName={false} className="qm-item-tooltip__material-icon" />
  ```
  - Same pattern: SCSS sets `--item-icon-size: 24px` on the class instead of `width`/`height` on `<img>`
- Needs icons (lines 374, 405, 437, 444): similarly migrate to `<SharedItemIcon>` with the appropriate `className`
- Remove local `getRarityClass` function (lines 27-29) — import from shared
- Update `_item-tooltip.scss`:
  - Remove the `border-color` + `background-image` rarity variant blocks for each icon class (lines 73-103, 422-452, 550-581) — now inherited from shared `_item-icon.scss`
  - Replace `width`/`height`/`object-fit` targeting `<img>` with `--item-icon-size` and `--item-icon-padding` custom properties on the class selector
  - Keep positioning rules (flex, margins, etc.) unchanged

**R5.5 — Migrate ListsView suggestion icons**
- `ListsView.tsx` line 443: replace `<img className="lists-view__suggestion-icon">` with:
  ```tsx
  <SharedItemIcon itemId={item.id} name={item.name} icon={item.icon} rarity={item.rarity} showName={false} className="lists-view__suggestion-icon" />
  ```
- Add `rarity` to the items passed into the suggestion list (the `itemsMap` values have `rarity`)
- Update `_lists-view.scss` suggestion-icon rules: remove explicit background/border-radius; keep only width/height positioning

**R5.6 — Remove quartermaster's local `$rarity-*-border` from `_variables.scss`**
- Replace local definitions (lines 44-48) with re-exports from shared:
  ```scss
  $rarity-common-border: shared.$rarity-common-border;
  $rarity-uncommon-border: shared.$rarity-uncommon-border;
  // ...
  ```

**R5.7 — Update quartermaster types**
- `src/apps/quartermaster/types/item.ts`: change `ItemRarity` to a re-export from `src/shared/types/item`

**R5.8 — Quartermaster specification update**
- After implementation, update `docs/specifications/quartermaster/specification-quartermaster.md` section 7.7 (Item Icon) to reflect:
  - ItemIcon now delegates visual rendering to `src/shared/components/ItemIcon` (imported as `SharedItemIcon`)
  - Rarity colors come from shared `_variables.scss` via `$rarity-*-border`
  - `size` prop values map to CSS custom property `--item-icon-size`: xs=30px, sm=80px, md=84px, lg=108px
  - ItemTooltip icon classes (`qm-item-tooltip__icon`, `qm-item-tooltip__material-icon`, `qm-item-tooltip__needs-icon`) use shared `SharedItemIcon` with per-class sizing via CSS

---

### R6 — Loot Helper
- **Leave entirely as-is.** This app is being deprecated. No imports changed, no SCSS changed, no component usage changed.

---

### R7 — Documentation for Future Agents

**R7.1 — Create `docs/Item-Icon.md`**
A practical reference for agents and developers on how to render item icons. Contents:
- **Quick Reference**: the one import you need (`import { ItemIcon, getRarityClass, ItemRarity } from '../shared/components/ItemIcon'`)
- **Component Props**: full props table with defaults, required vs optional
- **Size System**: default is 56px; override via `style={{ '--item-icon-size': 'XXpx' }}` on the parent; no fixed size variants in the shared component (quartermaster maps its own size prop separately)
- **Rarity Colors**: table of all 5 rarities with hex values and background image filenames
- **Usage Examples**: basic icon, icon with name, icon with quantity badge, icon with children overlay, blueprint icon
- **When NOT to use**: for tiny inline icons that are purely decorative (e.g., a 16px icon next to text that doesn't need rarity styling), a plain `<img>` may still be appropriate — use judgment
- **Where It's Not Used**: loot-helper (deprecated)
- **Adding a New App**: steps to wire up the shared component in a new tool
- **Verification Checklist**: run `npm run generate` to ensure data includes rarity; run `npm run build` to verify compilation; run `npm test`

---

### R8 — Styling Consistency

**R8.1 — Shared SCSS import order**
- `src/shared/styles/main.scss` imports `_item-icon.scss` (via `@use 'item-icon';`)
- `src/main.tsx` already imports `'./shared/styles/main.scss'` at the application root → all `.item-icon` classes are globally available in every app without per-app `@use`
- Apps that previously defined their own `.item-icon` rules (craft-calculator's `_item-search.scss`) must remove them to avoid CSS collision
- Quartermaster's `_item-icon.scss` `@use`s the shared partial and only keeps quartermaster-specific overrides

**R8.2 — Quest tooltip SCSS cleanup**
- Remove local `$rarity-common-border` through `$rarity-legendary-border` (lines 6-10) — no longer referenced anywhere
- Remove `QuestItemTile` SCSS block (lines 242-324) — all rarity styling now from globally-available shared `_item-icon.scss`
- Keep `.quest-tooltip__tiles` layout wrapper
- No additional `@use` needed

**R8.3 — Blueprint overlay SCSS cleanup**
- Remove `.blueprint-overlay-item-icon` rules (lines 82-88)
- The shared `ItemIcon` provides all icon styling; blueprint appearance comes from `isBlueprint={true}`

**R8.4 — Quartermaster `_variables.scss` cleanup**
- Replace local `$rarity-*-border` with re-exports from shared (see R5.6)

---

## Files Summary

### New Files
| File | Purpose |
|------|---------|
| `src/shared/types/item.ts` | Canonical `ItemRarity` type |
| `src/shared/utils/rarity.ts` | `getRarityClass()`, `normalizeItemRarity()` |
| `src/shared/styles/_item-icon.scss` | Shared icon SCSS: base, rarity variants, quantity, blueprint, clickable |
| `src/shared/components/ItemIcon.tsx` | Shared icon component |
| `public/images/rarities/blueprint_bg.png` | Blueprint background texture (fetched from CDN) |
| `docs/Item-Icon.md` | Agent-facing documentation on how to display item icons |

### Modified Files — Shared
| File | Change |
|------|--------|
| `src/shared/styles/_variables.scss` | Add `$rarity-*-border` variables |
| `src/shared/styles/main.scss` | Add `@use 'item-icon';` import |

### Modified Files — Craft Calculator
| File | Change |
|------|--------|
| `scripts/generate-item-data-craft-calculator.sh` | Add `rarity` to jq filter output |
| `src/apps/craft-calculator/types/item.ts` | Add `rarity?` to `Item`, `LocalizedItem` |
| `src/apps/craft-calculator/utils/itemData.ts` | Pass through rarity in loader |
| `src/apps/craft-calculator/components/ItemSearch.tsx` | Replace `<img>` with `<ItemIcon>` |
| `src/apps/craft-calculator/components/CraftCalculator.tsx` | Replace `<img>` tags with `<ItemIcon>`; add `rarity` to `RequiredItemWithName` |
| `src/apps/craft-calculator/components/UpgradeBreakdown.tsx` | Replace `<img>` with `<ItemIcon>`; add `rarity` to material rows |
| `src/apps/craft-calculator/styles/_item-search.scss` | Remove `.item-icon` rules (now shared) |
| `src/apps/craft-calculator/styles/_calculator.scss` | Remove `.selected-item-image` and `.required-item img` rules |
| `src/apps/craft-calculator/styles/_upgrade-breakdown.scss` | Remove `.material-icon` rules |

### Modified Files — Quests
| File | Change |
|------|--------|
| `src/apps/quests/components/QuestTooltip.tsx` | Replace `QuestItemTile` with shared `ItemIcon`; use shared `getRarityClass` |
| `src/apps/quests/components/BlueprintRewardsOverlay.tsx` | Replace `<img>` with `<ItemIcon rarity="Common" isBlueprint>` |
| `src/apps/quests/types/quest.ts` | Re-export `ItemRarity` from shared |
| `src/apps/quests/styles/_quest-tooltip.scss` | Remove local rarity vars + `QuestItemTile` SCSS (no import needed; shared styles globally available) |
| `src/apps/quests/styles/_blueprint-overlay.scss` | Remove `.blueprint-overlay-item-icon` rules |

### Modified Files — Quartermaster
| File | Change |
|------|--------|
| `src/apps/quartermaster/components/ItemIcon.tsx` | Delegate rendering to `SharedItemIcon` via `children`; map size to CSS custom property |
| `src/apps/quartermaster/components/ItemTooltip.tsx` | Replace all `<img>` icons with `<SharedItemIcon>`; use shared `getRarityClass` |
| `src/apps/quartermaster/components/views/ListsView.tsx` | Replace suggestion `<img>` with `<SharedItemIcon>` |
| `src/apps/quartermaster/styles/_item-icon.scss` | `@use` shared; keep only quartermaster-specific overrides |
| `src/apps/quartermaster/styles/_item-tooltip.scss` | Remove rarity variant blocks for icon classes |
| `src/apps/quartermaster/styles/_lists-view.scss` | Remove explicit background/border from suggestion-icon |
| `src/apps/quartermaster/styles/_variables.scss` | Import `$rarity-*-border` from shared |
| `src/apps/quartermaster/types/item.ts` | Re-export `ItemRarity` from shared |
| `docs/specifications/quartermaster/specification-quartermaster.md` | Update section 7.7 with shared component delegation |

### NOT Modified
| File | Reason |
|------|--------|
| `src/apps/loot-helper/**` | Deprecated — left as-is per explicit instruction |
| `src/apps/craft-calculator/components/CraftingResults.tsx` | No item icons to migrate |
| `src/apps/craft-calculator/utils/weaponTiers.ts` | No icon rendering, only data logic |

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Item has no `rarity` field | `normalizeItemRarity(null)` → `'Common'` with common border + background |
| Item has unknown rarity string | `normalizeItemRarity('Mythic')` → `'Common'` (graceful fallback) |
| Item has `rarity: "common"` (lowercase) | `getRarityClass('common')` → `'rarity-common'` (normalizes case) |
| Item has no `imageFilename` | Shared component renders empty container (no `<img>`); background image still shows |
| `showQuantity` with `null` quantity | Displays `?` with `item-icon__quantity--unknown` styling |
| Craft-calc required item with missing rarity (after regen) | Falls back to Common via `normalizeItemRarity` |
| Quest blueprint with missing rarity | Blueprints are always `"Common"`; `isBlueprint={true}` gives blueprint background |
| Quartermaster ItemIcon passes children with no shared overlays | Children render inside container, layered above the image |
| Quartermaster ItemIcon size `sm` → 80px | Mapped to `--item-icon-size: 80px`; shared component respects custom property |
| Multiple CSS custom property overrides on same page | Each `<ItemIcon>` instance is self-contained; no cross-contamination |
| Clicking an icon with `onClick` | Keyboard accessible (Enter/Space), focus-visible outline, cursor pointer |
| Re-running `npm run generate` after adding rarity | Craft items get rarity; quest data already includes rarity; no breaking changes |
| Two `.item-icon` CSS rules (old + shared) while migrating per app | Removed in same PR; `npm run build` catches selector conflicts |
| Item with `rarity` field but empty string | `normalizeItemRarity('')` → `'Common'` |

---

## Rollout Strategy

1. **Phase 1** (R1): Create shared infrastructure — types, utility, SCSS, blueprint_bg.png. Import in `main.scss`. No apps changed yet.
2. **Phase 2** (R2): Create shared `ItemIcon` component. Export all public symbols.
3. **Phase 3** (R3): Migrate craft-calculator — generator, types, all 6 icon locations, SCSS cleanup. Run `npm run generate` + `npm run build`.
4. **Phase 4** (R4): Migrate quests — tooltip tiles, blueprint overlay, SCSS cleanup. Run `npm run build`.
5. **Phase 5** (R5): Refactor quartermaster — ItemIcon wrapper, ItemTooltip icons, ListsView icons, SCSS cleanup, variables cleanup. Run `npm run build`.
6. **Phase 6** (R7): Write `docs/Item-Icon.md` agent documentation.
7. **Phase 7** (R5.8): Update `specification-quartermaster.md` section 7.7.
8. **Final verification**: `npm run generate && npm run build && npm test`
