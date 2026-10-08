# Item Icon — Agent Reference

Quick reference for rendering item icons across all apps.

## Icon Files and Pipeline

Item and bench icons are local WebP files generated from game textures:

- `public/images/items/<slug>.webp`: one per shipped item
- `public/images/benches/<benchSlug>-tier<level>.webp`: one per bench level (Generator chains)

Generation is done by `scripts/generate-item-icons.ts` (`npm run generate:item-icons`).
It reads the shipped item slugs from `public/data/game/items.json` (or `GAME_DATA_OUT`) and
the item records from `arc-data`. For each item, the first source that converts wins:

1. Own texture export: `arc-data` `icon` path under
   `embark-api/data-game-extract/current/textures/PioneerGame/Content/` (`.png`). Populated by `scripts/extract-all` (ticket A11).
2. Asset index: the `image` column of `embark-api/asset-index-data/asset_index.csv` for the item's asset id,
   resolved relative to `asset-index-data/`.
3. None: the generator logs the item as a fallback and no image is written; `itemIconUrl` then
   returns `''`. The site never loads item images from arctracker's CDN.

Images are resized to fit 256x256 (no enlargement) and encoded as WebP quality 90 with `sharp`.
Output is deterministic: files are only rewritten when their content changes. `.webp` files in the
two output directories that the run did not produce are deleted.

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `GAME_DATA_OUT` | `public/data/game` | Where `items.json` is read from |
| `GAME_DATA_DIR` | `embark-api/arc-data` | arc-data source |
| `IMAGES_OUT` | `public/images` | Image output root (also read by `itemIconUrl` / `benchIconUrl`) |
| `EMBARK_API_DIR` | `../embark-api` | Location of the embark-api checkout |

### Run Order

Icon URLs in the generated game data depend on which files exist, so the order matters:

```sh
npm run generate:game-data     # 1. domain JSON (items.json, benches.json, ...)
npm run generate:item-icons    # 2. WebP files into public/images/{items,benches}
npm run generate:game-data     # 3. regenerate so icon URLs point at the new files
```

`scripts/gamedata/icons.ts` resolves the URLs: `itemIconUrl(slug)` returns
`/images/items/<slug>.webp` when the file exists, else `''`.
`benchIconUrl(benchId, level)` returns `/images/benches/<benchId>-tier<level>.webp` or `null`.

The generator prints counts per source and a list of fallbacks (up to 30 lines) with the reason for each.

## Quick Reference

```tsx
import { ItemIcon, getRarityClass, ItemRarity } from '../shared/components/ItemIcon';
```

Or import utilities directly:

```tsx
import { getRarityClass, normalizeItemRarity } from '../shared/utils/rarity';
import type { ItemRarity } from '../shared/types/item';
```

## Component Props

| Prop | Type | Default | Required | Description |
|------|------|---------|----------|-------------|
| `itemId` | `string` | — | Yes | Unique item identifier (for `data-item-id` attribute) |
| `name` | `string` | — | Yes | Display name (used in `alt` text and optional name span) |
| `icon` | `string \| null` | — | No | Image URL. When missing/null, renders empty container with rarity background |
| `rarity` | `string \| null` | — | No | Normalized via `normalizeItemRarity()`. Missing / unknown = the game gives the item no rarity: no rarity class, neutral border |
| `quantity` | `number \| null` | — | No | Quantity for the badge. `null` displays `?` |
| `showName` | `boolean` | `true` | No | Render name span below the container |
| `showQuantity` | `boolean` | `false` | No | Render quantity badge in bottom-right |
| `isBlueprint` | `boolean` | `false` | No | Apply blueprint background texture (`blueprint_bg.png`) |
| `onClick` | `() => void` | — | No | When provided, adds `role="button"`, `tabIndex={0}`, keyboard support |
| `className` | `string` | — | No | Appended to the root div's class list |
| `style` | `CSSProperties` | — | No | Inline styles on the root div. Use `--item-icon-size` for sizing |
| `children` | `ReactNode` | — | No | Rendered inside the container, layered above the image (for app-specific overlays) |
| `containerRef` | `RefCallback \| RefObject` | — | No | Ref forwarded to the root div (used by quartermaster for hover intent) |

## Size System

Default container size is **56px**. Override per-instance via CSS custom property:

```tsx
<ItemIcon
  itemId={item.id}
  name={item.name}
  icon={item.icon}
  rarity={item.rarity}
  style={{ '--item-icon-size': '64px' } as React.CSSProperties}
/>
```

The padding inside the container defaults to **4px**. Override with `--item-icon-padding` if needed:

```tsx
style={{ '--item-icon-size': '80px', '--item-icon-padding': '6px' } as React.CSSProperties}
```

Quartermaster maps its own `size` prop (`xs`|`sm`|`md`|`lg`) to `--item-icon-size`: xs=30px, sm=80px, md=84px, lg=108px.

## Rarity Colors

| Rarity | Border Color | Background Image |
|--------|-------------|-----------------|
| Common | `#9e9e9e` | `/images/rarities/common_bg.png` |
| Uncommon | `#4caf50` | `/images/rarities/uncommon_bg.png` |
| Rare | `#2196f3` | `/images/rarities/rare_bg.png` |
| Epic | `#9c27b0` | `/images/rarities/epic_bg.png` |
| Legendary | `#ff9800` | `/images/rarities/legendary_bg.png` |
| Amplified | `$rarity-amplified-border` | none (border only) |

Blueprint items use `/images/rarities/blueprint_bg.png` with common border color.

## Usage Examples

### Basic Icon

```tsx
<ItemIcon
  itemId={item.id}
  name={item.name}
  icon={item.imageFilename}
  rarity={item.rarity}
  showName={false}
/>
```

### Icon with Name

```tsx
<ItemIcon
  itemId={item.id}
  name={item.name}
  icon={item.icon}
  rarity={item.rarity}
  showName={true}
/>
```

### Icon with Quantity Badge

```tsx
<ItemIcon
  itemId={item.id}
  name={item.name}
  icon={item.icon}
  rarity={item.rarity}
  showQuantity={true}
  quantity={item.amount}
/>
```

### Icon with Children Overlay (quartermaster pattern)

```tsx
<ItemIcon itemId={item.id} name={item.name} icon={item.icon} rarity={item.rarity}>
  {hasBadges && (
    <div className="item-icon__badges">
      {badges.map(badge => (
        <span key={badge.key} className={`item-icon__badge item-icon__badge--${badge.type}`}>
          {badge.label}
        </span>
      ))}
    </div>
  )}
</ItemIcon>
```

### Blueprint Icon

```tsx
<ItemIcon
  itemId={blueprint.id}
  name={blueprint.name}
  icon={blueprint.imageFilename}
  rarity="Common"
  isBlueprint={true}
  showName={false}
/>
```

### Clickable Icon

```tsx
<ItemIcon
  itemId={item.id}
  name={item.name}
  icon={item.icon}
  rarity={item.rarity}
  onClick={() => handleClick(item.id)}
/>
```

## When NOT to Use

- Tiny decorative inline icons (e.g., 16px next to text that don't need rarity styling) — a plain `<img>` may still be appropriate
- The shared component includes rarity borders, background images, and a fixed container structure — if you just need a raw image, use `<img>` directly

## Where It's Not Used

- **Loot Helper** (`src/apps/loot-helper/`) — this app is deprecated and left as-is

## Adding a New App

1. Ensure data pipeline includes `rarity` field (update generator scripts if needed)
2. Use `<ItemIcon>` from `../../../shared/components/ItemIcon` in all icon locations
3. Use `--item-icon-size` CSS custom property for per-instance sizing
4. Remove any local `.item-icon` or icon-related SCSS rules — styling is provided by shared `_item-icon.scss` (globally available via `src/shared/styles/main.scss`)
5. For app-specific overlays, use the `children` prop (they render inside the container, layered above the image)

## Verification Checklist

- [ ] Run `npm run generate` to ensure generated data includes `rarity`
- [ ] Run `npm run build` to verify TypeScript + SCSS compilation
- [ ] Run `npm test` to verify existing tests pass
- [ ] Check that old local icon SCSS rules have been removed to avoid CSS collisions
- [ ] Verify icons render with correct rarity border colors and background images
