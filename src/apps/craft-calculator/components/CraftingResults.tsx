import type { CraftingResult } from '../types/crafting';
import { StashSpaceGraph } from './StashSpaceGraph';

interface CraftingResultsProps {
  result: CraftingResult;
  profitPerCraft: number | null;
}

const formatValue = (value: number): string => {
  return value.toLocaleString('en-US');
};

export function CraftingResults({ result, profitPerCraft }: CraftingResultsProps) {
  return (
    <>
      <div className="card">
        <StashSpaceGraph
          dataPoints={result.allDataPoints}
          currentSlots={result.currentStash.totalSlots}
          optimalAmount={result.optimalCraftAmount}
          minCraftForReduction={result.minCraftForReduction}
          craftQuantity={result.craftQuantity}
        />
      </div>

      <div className="card">
        <div className="recommendation">
          <h3>💡 Optimal Recommendation</h3>
          <div className="recommendation-text">
            {result.optimalCraftAmount === 0 ? (
              <>
                <strong>Don't craft anything.</strong> Your current stash is already optimally
                organized. Crafting would increase stash usage.
                {result.minCraftForReduction && (
                  <>
                    {' '}
                    However, if you craft at least{' '}
                    <strong>
                      {result.minCraftForReduction} {result.minCraftForReduction === 1 ? 'time' : 'times'}
                      {result.craftQuantity > 1 && ` (${result.minCraftForReduction * result.craftQuantity} items)`}
                    </strong>, you will start saving space.
                  </>
                )}
              </>
            ) : result.optimalCraftAmount === result.maxCraftable ? (
              <>
                <strong>
                  Craft all {result.maxCraftable} {result.maxCraftable === 1 ? 'time' : 'times'}
                  {result.craftQuantity > 1 && ` (${result.maxCraftable * result.craftQuantity} items)`}.
                </strong>{' '}
                This will{' '}
                {result.optimalSpaceChange < 0 ? (
                  <>
                    <span style={{ color: '#4caf50' }}>
                      save {Math.abs(result.optimalSpaceChange)} slot
                      {Math.abs(result.optimalSpaceChange) !== 1 ? 's' : ''}
                    </span>
                  </>
                ) : result.optimalSpaceChange > 0 ? (
                  <>
                    <span style={{ color: '#ff9800' }}>
                      use {result.optimalSpaceChange} more slot
                      {result.optimalSpaceChange !== 1 ? 's' : ''}
                    </span>
                  </>
                ) : (
                  'not change your stash usage'
                )}
                .
              </>
            ) : (
              <>
                <strong>
                  Craft exactly {result.optimalCraftAmount} {result.optimalCraftAmount === 1 ? 'time' : 'times'}
                  {result.craftQuantity > 1 && ` (${result.optimalCraftAmount * result.craftQuantity} items)`}.
                </strong>{' '}
                {result.optimalSpaceChange < 0 ? (
                  <>
                    This will minimize stash usage to {result.optimalStash.totalSlots} slots (
                    <span style={{ color: '#4caf50' }}>
                      saving {Math.abs(result.optimalSpaceChange)} slot
                      {Math.abs(result.optimalSpaceChange) !== 1 ? 's' : ''}
                    </span>
                    ).
                  </>
                ) : result.optimalSpaceChange > 0 ? (
                  <>
                    This will use {result.optimalStash.totalSlots} slots (
                    <span style={{ color: '#ff9800' }}>
                      {result.optimalSpaceChange} more slot
                      {result.optimalSpaceChange !== 1 ? 's' : ''}
                    </span>
                    ).
                  </>
                ) : (
                  'This will keep the current stash usage, but fill all slots to maximum stacking size.'
                )}
              </>
            )}
            {profitPerCraft != null && result.optimalCraftAmount > 0 && (() => {
              const totalValueChange = profitPerCraft * result.optimalCraftAmount;
              let valueColor: string;
              let valueText: string;
              
              if (totalValueChange > 0) {
                valueColor = '#4caf50';
                valueText = `increase by`;
              } else if (totalValueChange < 0) {
                valueColor = '#f44336';
                valueText = `decrease by`;
              } else {
                return (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    Your stash value will stay the same.
                  </div>
                );
              }
              
              return (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  Your stash value will {valueText}{' '}
                  <span style={{ color: valueColor, fontWeight: 'bold' }}>
                    <img src="/images/icon-coin.webp" alt="coin" style={{ width: '18px', height: '18px', verticalAlign: 'middle', marginRight: '4px' }} />
                    {formatValue(Math.abs(totalValueChange))}
                  </span>.
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </>
  );
}
