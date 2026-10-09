/** Display reference of an item (name, icon and rarity from the catalog). */
export type ItemRef = { id: string; name: string; icon?: string; rarity?: string };

export type TileSize = 48 | 64 | 80 | 112;

/** An item with an optional amount and sublabel, as shown by `ItemTile`. */
export interface TileSpec {
  item: ItemRef;
  /** Number renders as "3×"; a string is shown as is ("50 RP"). */
  amount?: number | string;
  sublabel?: string;
  /** Draw the blueprint frame around the icon. */
  isBlueprint?: boolean;
}

/** A bench (or room) image with its label, e.g. "Gunsmith level 4". */
export interface WhereRef {
  image?: string;
  label: string;
}
