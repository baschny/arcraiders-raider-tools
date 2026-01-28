import type { CraftingDataPoint } from '../types/crafting';

interface StashSpaceGraphProps {
  dataPoints: CraftingDataPoint[];
  currentSlots: number;
  optimalAmount: number;
  minCraftForReduction: number | null;
}

export function StashSpaceGraph({
  dataPoints,
  currentSlots,
  optimalAmount,
  minCraftForReduction,
}: StashSpaceGraphProps) {
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

  return (
    <div className="stash-graph">
      <div className="graph-title">Stash Space by Craft Amount</div>
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
                  title={`Craft ${point.amount}: ${point.slots} slots (${point.slots - currentSlots >= 0 ? '+' : ''}${point.slots - currentSlots})`}
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
          <div className="y-label">{maxSlots} slots</div>
          <div className="y-label" style={{ position: 'absolute', bottom: '0', width: '100%' }}>
            {minSlots} slots
          </div>
        </div>
      </div>
      <div className="graph-legend">
        <div className="legend-item">
          <div className="legend-color bar-saves-optimal" />
          <span>Optimal</span>
        </div>
        <div className="legend-item">
          <div className="legend-color bar-saves" />
          <span>Saves Space</span>
        </div>
        <div className="legend-item">
          <div className="legend-color bar-uses-more" />
          <span>Uses More</span>
        </div>
        <div className="legend-item">
          <div className="legend-color bar-same" />
          <span>Same Space</span>
        </div>
      </div>
    </div>
  );
}
