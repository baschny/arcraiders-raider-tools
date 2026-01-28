import { useState, useCallback, useRef, useEffect } from 'react';
import type { Item, ItemsMap } from '../types/item';
import { ItemInfoBox } from './ItemInfoBox';
import { useHoverIntent } from '../hooks/useHoverIntent';

interface ItemIconWithInfoProps {
  item: Item;
  itemsMap: ItemsMap;
  className?: string;
  alt?: string;
}

export function ItemIconWithInfo({ item, itemsMap, className = '', alt }: ItemIconWithInfoProps) {
  const [infoBoxPosition, setInfoBoxPosition] = useState<{ x: number; y: number; maxHeight?: string }>({ x: 0, y: 0 });
  const { ref, isHovered, handlers } = useHoverIntent<HTMLImageElement>({ delayShow: 500, delayHide: 100 });
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Calculate position when showing
  const updatePosition = useCallback(() => {
    if (!imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Default: show to the right of the icon
    let x = rect.right + 2;
    let y = rect.top;

    // If info box would overflow right side, show on left
    const infoBoxWidth = 400; // max-width from CSS
    if (x + infoBoxWidth > viewportWidth) {
      x = rect.left - infoBoxWidth - 2;
    }

    // Ensure info box doesn't go off the left edge
    if (x < 10) {
      x = 10;
    }

    // Adjust vertical position to keep within viewport
    // We assume a reasonable max height to decide if we should flip up
    const estimatedHeight = 500; 
    
    // If it would overflow bottom significantly, move it up
    if (y + estimatedHeight > viewportHeight) {
      y = viewportHeight - estimatedHeight - 10;
    }
    
    // Ensure top doesn't go off screen
    if (y < 10) {
      y = 10;
    }

    // Calculate strict max height based on final y position
    // (viewport height - top position - bottom margin)
    const maxHeightVal = viewportHeight - y - 10;
    const maxHeight = `${maxHeightVal}px`;

    setInfoBoxPosition({ x, y, maxHeight });
  }, []);

  useEffect(() => {
    if (isHovered) {
      updatePosition();
    }
  }, [isHovered, updatePosition]);

  // Combine refs
  const setRefs = useCallback(
    (element: HTMLImageElement | null) => {
      imageRef.current = element;
      ref.current = element;
    },
    [ref]
  );

  if (!item.imageFilename) return null;

  return (
    <>
      <img
        ref={setRefs}
        src={item.imageFilename}
        alt={alt || item.name.en}
        className={className}
      />
      <ItemInfoBox
        item={item}
        itemsMap={itemsMap}
        position={infoBoxPosition}
        visible={isHovered}
        onMouseEnter={handlers.onMouseEnter}
        onMouseLeave={handlers.onMouseLeave}
        onContextMenu={handlers.onContextMenu}
        maxHeight={infoBoxPosition.maxHeight}
      />
    </>
  );
}
