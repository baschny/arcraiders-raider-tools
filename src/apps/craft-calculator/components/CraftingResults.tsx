import type { CraftingResult } from '../types/crafting';
import { StashSpaceGraph } from './StashSpaceGraph';

interface CraftingResultsProps {
  result: CraftingResult;
}

export function CraftingResults({ result }: CraftingResultsProps) {
  return (
    <>
      <div className="card">
        <StashSpaceGraph
          dataPoints={result.allDataPoints}
          currentSlots={result.currentStash.totalSlots}
          optimalAmount={result.optimalCraftAmount}
          minCraftForReduction={result.minCraftForReduction}
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
                    <strong>{result.minCraftForReduction} items</strong>, you will start saving
                    space.
                  </>
                )}
              </>
            ) : result.optimalCraftAmount === result.maxCraftable ? (
              <>
                <strong>Craft all {result.maxCraftable} items.</strong> This will{' '}
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
                <strong>Craft exactly {result.optimalCraftAmount} items.</strong>{' '}
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
          </div>
        </div>
      </div>
    </>
  );
}
