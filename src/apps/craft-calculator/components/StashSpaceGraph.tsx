import type { CraftingDataPoint } from '../types/crafting';
import { useLocale } from '../../../shared/context/LocaleContext';

interface StashSpaceGraphProps {
  dataPoints: CraftingDataPoint[];
  currentSlots: number;
  optimalAmount: number;
  minCraftForReduction: number | null;
  craftQuantity: number;
}

export function StashSpaceGraph({
  dataPoints,
  currentSlots,
  optimalAmount,
  minCraftForReduction,
  craftQuantity,
}: StashSpaceGraphProps) {
  const { t, tm } = useLocale();
  if (dataPoints.length === 0) return null;

  const maxSlots = Math.max(...dataPoints.map((p) => p.slots));
  const minSlots = Math.min(...dataPoints.map((p) => p.slots));
  const slotRange = maxSlots - minSlots || 1;

  const getBarClass = (index: number, slots: number) => {
    const isOptimalOrMin = index === optimalAmount || (minCraftForReduction && index === minCraftForReduction);
    
    if (slots < currentSlots) {
      return isOptimalOrMin ? 'bar-saves-optimal' : 'bar-saves';
    }
    if (slots > currentSlots) {
      return isOptimalOrMin ? 'bar-uses-more-optimal' : 'bar-uses-more';
    }
    return isOptimalOrMin ? 'bar-same-optimal' : 'bar-same';
  };

  const maxHeight = 100;
  const minBarHeight = 20;

  const getTimesLabel = (count: number) =>
    count === 1 ? t('craftCalculator.timeSingle') : t('craftCalculator.timePlural');
  const getItemsSuffix = (count: number) =>
    craftQuantity > 1 ? tm('craftCalculator.itemSuffix', { count: count * craftQuantity }) : '';
  const getSlotLabel = (count: number) =>
    count === 1 ? t('craftCalculator.slotSingle') : t('craftCalculator.slotPlural');

  return (
    <div className="stash-graph">
      <div className="graph-title">{t('craftCalculator.graphTitle')}</div>
      <div className="graph-container">
        <div className="graph-bars">
          {dataPoints.map((point, index) => {
            const barHeight = ((point.slots - minSlots) / slotRange) * maxHeight + minBarHeight;
            const isOptimal = index === optimalAmount;

            const barClass = getBarClass(index, point.slots);
            const showOptimalBorder = isOptimal && point.slots < currentSlots;

            return (
              <div key={index} className="graph-bar-wrapper">
                <div
                  className={`graph-bar ${barClass} ${showOptimalBorder ? 'optimal' : ''}`}
                  style={{
                    height: `${barHeight}px`,
                  }}
                  title={tm('craftCalculator.graphTooltip', {
                    count: point.amount,
                    timesLabel: getTimesLabel(point.amount),
                    itemsSuffix: getItemsSuffix(point.amount),
                    slots: point.slots,
                    slotLabel: getSlotLabel(point.slots),
                    delta: `${point.slots - currentSlots >= 0 ? '+' : ''}${point.slots - currentSlots}`,
                  })}
                >
                  {isOptimal && <div className="bar-label optimal-label">★</div>}
                </div>
                <div className="graph-x-label">
                  {(index === 0 ||
                    isOptimal ||
                    point.slots !== dataPoints[index - 1]?.slots) &&
                    point.amount}
                </div>
              </div>
            );
          })}
        </div>
        <div className="graph-y-axis">
          <div className="y-label">{maxSlots} {getSlotLabel(maxSlots)}</div>
          <div className="y-label" style={{ position: 'absolute', bottom: '0', width: '100%' }}>
            {minSlots} {getSlotLabel(minSlots)}
          </div>
        </div>
      </div>
      <div className="graph-legend">
        <div className="legend-item">
          <div className="legend-color bar-saves-optimal" />
          <span>{t('craftCalculator.graphOptimal')}</span>
        </div>
        <div className="legend-item">
          <div className="legend-color bar-saves" />
          <span>{t('craftCalculator.graphSavesSpace')}</span>
        </div>
        <div className="legend-item">
          <div className="legend-color bar-uses-more" />
          <span>{t('craftCalculator.graphUsesMore')}</span>
        </div>
        <div className="legend-item">
          <div className="legend-color bar-same" />
          <span>{t('craftCalculator.graphSameSpace')}</span>
        </div>
      </div>
    </div>
  );
}
