import type { CraftingResult } from '../types/crafting';
import { StashSpaceGraph } from './StashSpaceGraph';
import { useLocale } from '../../../shared/context/LocaleContext';

interface CraftingResultsProps {
  result: CraftingResult;
  profitPerCraft: number | null;
}

export function CraftingResults({ result, profitPerCraft }: CraftingResultsProps) {
  const { t, tm, formatNumber } = useLocale();
  const timesLabel = (count: number) =>
    count === 1 ? t('craftCalculator.timeSingle') : t('craftCalculator.timePlural');
  const slotLabel = (count: number) =>
    count === 1 ? t('craftCalculator.slotSingle') : t('craftCalculator.slotPlural');
  const itemsSuffix = (count: number) =>
    result.craftQuantity > 1 ? tm('craftCalculator.itemSuffix', { count: count * result.craftQuantity }) : '';

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
          <h3>💡 {t('craftCalculator.recommendationTitle')}</h3>
          <div className="recommendation-text">
            {result.optimalCraftAmount === 0 ? (
              <>
                <strong>{t('craftCalculator.recommendDoNotCraftStrong')}</strong>{' '}
                {t('craftCalculator.recommendDoNotCraftBody')}
                {result.minCraftForReduction && (
                  <>
                    {' '}
                    <strong>
                      {tm('craftCalculator.recommendDoNotCraftMin', {
                        count: result.minCraftForReduction,
                        timesLabel: timesLabel(result.minCraftForReduction),
                        itemsSuffix: itemsSuffix(result.minCraftForReduction),
                      })}
                    </strong>
                  </>
                )}
              </>
            ) : result.optimalCraftAmount === result.maxCraftable ? (
              <>
                <strong>
                  {tm('craftCalculator.recommendCraftAll', {
                    count: result.maxCraftable,
                    timesLabel: timesLabel(result.maxCraftable),
                    itemsSuffix: itemsSuffix(result.maxCraftable),
                  })}
                </strong>{' '}
                {result.optimalSpaceChange < 0 ? (
                  <>
                    <span style={{ color: '#4caf50' }}>
                      {tm('craftCalculator.recommendWillSave', {
                        count: Math.abs(result.optimalSpaceChange),
                        slotLabel: slotLabel(Math.abs(result.optimalSpaceChange)),
                      })}
                    </span>
                  </>
                ) : result.optimalSpaceChange > 0 ? (
                  <>
                    <span style={{ color: '#ff9800' }}>
                      {tm('craftCalculator.recommendWillUseMore', {
                        count: result.optimalSpaceChange,
                        slotLabel: slotLabel(result.optimalSpaceChange),
                      })}
                    </span>
                  </>
                ) : (
                  t('craftCalculator.recommendNoChange')
                )}
                .
              </>
            ) : (
              <>
                <strong>
                  {tm('craftCalculator.recommendCraftExact', {
                    count: result.optimalCraftAmount,
                    timesLabel: timesLabel(result.optimalCraftAmount),
                    itemsSuffix: itemsSuffix(result.optimalCraftAmount),
                  })}
                </strong>{' '}
                {result.optimalSpaceChange < 0 ? (
                  <>
                    {tm('craftCalculator.recommendMinimizeTo', {
                      slots: result.optimalStash.totalSlots,
                      slotLabel: slotLabel(result.optimalStash.totalSlots),
                      savingText: tm('craftCalculator.savingText', {
                        count: Math.abs(result.optimalSpaceChange),
                        slotLabel: slotLabel(Math.abs(result.optimalSpaceChange)),
                      }),
                    })}
                  </>
                ) : result.optimalSpaceChange > 0 ? (
                  <>
                    {tm('craftCalculator.recommendUseTo', {
                      slots: result.optimalStash.totalSlots,
                      slotLabel: slotLabel(result.optimalStash.totalSlots),
                      increaseText: tm('craftCalculator.increaseText', {
                        count: result.optimalSpaceChange,
                        slotLabel: slotLabel(result.optimalSpaceChange),
                      }),
                    })}
                  </>
                ) : (
                  t('craftCalculator.recommendKeepCurrent')
                )}
              </>
            )}
            {profitPerCraft != null && result.optimalCraftAmount > 0 && (() => {
              const totalValueChange = profitPerCraft * result.optimalCraftAmount;
              let valueColor: string;
              let valueText: string;
              
              if (totalValueChange > 0) {
                valueColor = '#4caf50';
                valueText = t('craftCalculator.stashValueIncrease');
              } else if (totalValueChange < 0) {
                valueColor = '#f44336';
                valueText = t('craftCalculator.stashValueDecrease');
              } else {
                return (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    {t('craftCalculator.stashValueSame')}
                  </div>
                );
              }
              
              return (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  {t('craftCalculator.stashValuePrefix')} {valueText}{' '}
                  <span style={{ color: valueColor, fontWeight: 'bold' }}>
                    <img src="/images/icon-coin.webp" alt="coin" style={{ width: '18px', height: '18px', verticalAlign: 'middle', marginRight: '4px' }} />
                    {formatNumber(Math.abs(totalValueChange))}
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
