import { createContext, useContext } from 'react';
import type { ItemsMap } from '../../quartermaster/types/item';

export interface ItemOverlayApi {
  items: ItemsMap;
  /** Opens the Quartermaster item overlay next to the clicked element (click again to close). */
  open: (slug: string, anchor: HTMLElement) => void;
}

export const ItemOverlayContext = createContext<ItemOverlayApi>({ items: {}, open: () => {} });

export const useItemOverlay = () => useContext(ItemOverlayContext);
