/**
 * Item Icon Component
 * See specification section 7.7
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Star } from 'lucide-react';
import type { ItemRarity, ItemsMap } from '../types/item';
import type { PlannerResult } from '../types/planner';
import { getEmptyItemInsight, type ItemInsightsMap } from '../utils/itemInsights';
import { useHoverIntent } from '../../../shared/hooks/useHoverIntent';
import { usePrioritizedItems } from '../hooks/usePrioritizedItems';
import { useLocale } from '../../../shared/context/LocaleContext';
import { ItemTooltip } from './ItemTooltip';
import { ItemIcon as SharedItemIcon } from '../../../shared/components/ItemIcon';
import { getCraftStatus } from '../utils/weaponMods';

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
  const { t } = useLocale();
  const { prioritizedSet, togglePrioritize } = usePrioritizedItems();
  const isPrioritized = prioritizedSet.has(itemId);
  const canShowTooltip = !!tooltipContext && enableTooltip && !!tooltipContext.itemsMap[itemId];
  const canPrioritize = !!tooltipContext;
  const craftability = tooltipContext?.plannerResult?.craftability?.[itemId];
  const showRedLock = getCraftStatus(craftability) === 'uncraftable';
  const iconRef = useRef<HTMLDivElement | null>(null);
  const { ref: hoverRef, isHovered, handlers } = useHoverIntent<HTMLDivElement>({ delayShow: 350, delayHide: 120 });
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0, maxHeight: 420 });
  // Sort badges by priority (ascending)
  const sortedBadges = useMemo(() => [...badges].sort((a, b) => a.priority - b.priority), [badges]);

  const sizePx = { xs: '30px', sm: '80px', md: '84px', lg: '108px' }[size];
  const quantityLabel = quantity === null ? '?' : quantity;

  const handleTogglePrioritize = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      togglePrioritize(itemId);
    },
    [itemId, togglePrioritize],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
    },
    [],
  );

  const updateTooltipPosition = useCallback(() => {
    if (!iconRef.current || !canShowTooltip) return;

    const rect = iconRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 12;

    // Determine if tooltip will be two-column (has planning insights)
    const insight = tooltipContext?.itemInsights
      ? getEmptyItemInsight(tooltipContext.itemInsights, itemId)
      : null;
    const isTwoCol = insight && (insight.finalListNeeds.length > 0 || insight.craftingNeeds.length > 0);
    const estimatedWidth = isTwoCol ? 740 : 430;
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
  }, [canShowTooltip, tooltipContext, itemId]);

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
  const prioritizeTitle = isPrioritized
    ? t('quartermaster.inRaid.prioritizeRemove')
    : t('quartermaster.inRaid.prioritizeMark');

  return (
    <>
      <SharedItemIcon
        itemId={itemId}
        name={name}
        icon={icon}
        rarity={rarity}
        showName={showName}
        showQuantity={false}
        onClick={onClick}
        className={`${canShowTooltip ? 'item-icon--has-tooltip' : ''}`}
        style={{ '--item-icon-size': sizePx } as React.CSSProperties}
        containerRef={setRefs}
      >
        {canPrioritize && (
          <button
            type="button"
            className={`item-icon__prioritize ${isPrioritized ? 'item-icon__prioritize--active' : ''}`}
            onClick={handleTogglePrioritize}
            onKeyDown={handleKeyDown}
            title={prioritizeTitle}
            aria-label={prioritizeTitle}
          >
            <Star size={14} fill={isPrioritized ? 'currentColor' : 'none'} strokeWidth={2} />
          </button>
        )}

        {showRedLock && (
          <span className="item-icon__lock" title={t('quartermaster.itemIcon.uncraftable')}>
            <Lock size={12} strokeWidth={2.5} />
          </span>
        )}

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
      </SharedItemIcon>

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