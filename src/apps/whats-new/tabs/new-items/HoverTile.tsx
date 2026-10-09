import { ItemHoverCard, ItemTile, type TileSize } from '../../components';
import { toItemRef } from '../../hooks/useWhatsNewData';
import { buildHover, type HoverContext, type HoverSource } from './hover';
import { isBlueprintItem } from './model';

export interface HoverTileProps {
  ctx: HoverContext;
  source: HoverSource;
  size?: TileSize;
  /** Number renders as "3×"; a string is shown as is ("+50 RP"). */
  amount?: number | string;
  /** Force or suppress the blueprint frame; default: blueprint items get it. */
  isBlueprint?: boolean;
}

/** An item tile that opens the item's hover card (all of its uses) on hover, focus or tap. */
export function HoverTile({ ctx, source, size = 80, amount, isBlueprint }: HoverTileProps) {
  const item = toItemRef(ctx.data.catalog, source.id);
  const { subtitle, sections } = buildHover(ctx, source);
  const blueprint = isBlueprint ?? isBlueprintItem(ctx.data, source.id, ctx.blueprintUnlocks);
  // A blueprint tile shows what it unlocks (in the blueprint frame), keeping the blueprint's own name.
  const unlocked = blueprint ? ctx.blueprintUnlocks.get(source.id) : undefined;
  const tileItem = unlocked ? { ...item, icon: toItemRef(ctx.data.catalog, unlocked).icon ?? item.icon } : item;
  return (
    <ItemHoverCard item={item} subtitle={subtitle} sections={sections}>
      <ItemTile item={tileItem} size={size} amount={amount} isBlueprint={blueprint} />
    </ItemHoverCard>
  );
}
