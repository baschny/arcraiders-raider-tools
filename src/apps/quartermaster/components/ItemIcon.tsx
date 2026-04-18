/**
 * Item Icon Component
 * See specification section 7.7
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ItemRarity, ItemsMap } from '../types/item';
import type { PlannerResult } from '../types/planner';
import type { ItemInsightsMap } from '../utils/itemInsights';
import { useHoverIntent } from '../../../shared/hooks/useHoverIntent';
import { ItemTooltip } from './ItemTooltip';

export interface ItemIconBadge {
  key: string;
  label?: string;
  type: 'keep' | 'recycle' | 'discard' | 'salvage' | 'bring-home' | 'missing' | 'uncraftable' | 'have' | 'can-craft' | 'direct-target';
  priority: number;
}
export interface ItemIconTooltipContext {
  itemsMap: ItemsMap;
  plannerResult: PlannerResult;
  itemInsights: ItemInsightsMap;
}

export interface ItemIconProps {
  itemId: string;
  name: string;
  icon: string;
  rarity: ItemRarity;
  quantity: number | null;
  badges?: ItemIconBadge[];
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showName?: boolean;
  showQuantity?: boolean;
  enableTooltip?: boolean;
  tooltipContext?: ItemIconTooltipContext;
  onClick?: () => void;
}

/**
 * Reusable component for displaying items consistently across the module
 */
export function ItemIcon({
  itemId,
  name,
  icon,
  rarity,
  quantity,
  badges = [],
  size = 'md',
  showName = true,
  showQuantity = true,
  enableTooltip = true,
  tooltipContext,
  onClick,
}: ItemIconProps) {
  const canShowTooltip = !!tooltipContext && enableTooltip && !!tooltipContext.itemsMap[itemId];
  const iconRef = useRef<HTMLDivElement | null>(null);
  const { ref: hoverRef, isHovered, handlers } = useHoverIntent<HTMLDivElement>({ delayShow: 350, delayHide: 120 });
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0, maxHeight: 420 });
  // Sort badges by priority (ascending)
  const sortedBadges = useMemo(() => [...badges].sort((a, b) => a.priority - b.priority), [badges]);

  const rarityClass = `rarity-${rarity.toLowerCase()}`;
  const sizeClass = size !== 'md' ? `item-icon--${size}` : '';
  const quantityLabel = quantity === null ? '?' : quantity;

  const updateTooltipPosition = useCallback(() => {
    if (!iconRef.current || !canShowTooltip) return;

    const rect = iconRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 12;
    const estimatedWidth = 430;
    const estimatedHeight = 560;

    let x = rect.right + 10;
    let y = rect.top;

    if (x + estimatedWidth > viewportWidth - margin) {
      x = rect.left - estimatedWidth - 10;
    }
    if (x < margin) {
      x = margin;
    }

    if (y + estimatedHeight > viewportHeight - margin) {
      y = viewportHeight - estimatedHeight - margin;
    }
    if (y < margin) {
      y = margin;
    }

    const maxHeight = Math.max(250, viewportHeight - y - margin);
    setTooltipPosition({ x, y, maxHeight });
  }, [canShowTooltip]);

  useEffect(() => {
    if (!isHovered || !canShowTooltip) return;
    updateTooltipPosition();

    const onViewportChange = () => updateTooltipPosition();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [canShowTooltip, isHovered, updateTooltipPosition]);

  const setRefs = useCallback(
    (element: HTMLDivElement | null) => {
      iconRef.current = element;
      hoverRef.current = element;
    },
    [hoverRef],
  );

  const tooltipItem = canShowTooltip ? tooltipContext.itemsMap[itemId] : undefined;

  return (
    <>
      <div
        ref={setRefs}
        className={`item-icon ${rarityClass} ${sizeClass} ${canShowTooltip ? 'item-icon--has-tooltip' : ''}`}
        onClick={onClick}
        style={{ cursor: onClick ? 'pointer' : 'default' }}
      >
        <div className="item-icon__container">
          <img
            className="item-icon__image"
            src={icon}
            alt={name}
            loading="lazy"
          />

          {showQuantity && (
            <span className={`item-icon__quantity ${quantity === null ? 'item-icon__quantity--unknown' : ''}`}>
              {quantityLabel}
            </span>
          )}

          {sortedBadges.length > 0 && (
            <div className="item-icon__badges">
              {sortedBadges.map((badge) => (
                <span
                  key={badge.key}
                  className={`item-icon__badge item-icon__badge--${badge.type}`}
                >
                  {badge.label || badge.type}
                </span>
              ))}
            </div>
          )}
        </div>

        {showName && <span className="item-icon__name qm-item-name">{name}</span>}
      </div>

      {tooltipItem && (
        <ItemTooltip
          item={tooltipItem}
          itemsMap={tooltipContext!.itemsMap}
          plannerResult={tooltipContext!.plannerResult}
          itemInsights={tooltipContext!.itemInsights}
          ownedQuantity={quantity}
          position={tooltipPosition}
          visible={isHovered}
          onMouseEnter={handlers.onMouseEnter}
          onMouseLeave={handlers.onMouseLeave}
          onContextMenu={handlers.onContextMenu}
        />
      )}
    </>
  );
}
