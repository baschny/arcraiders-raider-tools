import { useState } from 'react';
import { Info } from 'lucide-react';
import type { UpgradeBreakdown as UpgradeBreakdownType } from '../utils/weaponTiers';
import { getItem } from '../utils/itemData';
import { useLocale } from '../../../shared/context/LocaleContext';
import { ItemIcon } from '../../../shared/components/ItemIcon';

interface UpgradeBreakdownProps {
  breakdown: UpgradeBreakdownType[];
}

export function UpgradeBreakdown({ breakdown }: UpgradeBreakdownProps) {
  const { t, tm } = useLocale();
  const [showTooltip, setShowTooltip] = useState(false);

  if (breakdown.length <= 1) {
    return null;
  }

  // Collect all unique materials across all tiers
  const allMaterials = new Set<string>();
  breakdown.forEach(tier => {
    Object.keys(tier.materials).forEach(matId => allMaterials.add(matId));
  });

  // Build material rows with amounts per tier
  const materialRows = Array.from(allMaterials).map(materialId => {
    const material = getItem(materialId);
    const tierAmounts = breakdown.map(tier => tier.materials[materialId] || 0);
    const total = tierAmounts.reduce((sum, amt) => sum + amt, 0);
    
    return {
      materialId,
      materialName: material?.name || materialId,
      imageUrl: material?.imageFilename,
      rarity: material?.rarity,
      tierAmounts,
      total
    };
  });

  return (
    <div className="upgrade-breakdown-container">
      <button
        className="info-icon"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        aria-label={t('craftCalculator.showUpgradeBreakdown')}
      >
        <Info size={20} />
      </button>
      {showTooltip && (
        <div className="upgrade-breakdown-tooltip">
          <h4>{t('craftCalculator.breakdownTitle')}</h4>
          <table className="breakdown-table">
            <thead>
              <tr>
                <th>{t('craftCalculator.materialHeader')}</th>
                {breakdown.map((tier) => (
                  <th key={tier.tier}>{tm('craftCalculator.tierHeader', { tier: tier.tier })}</th>
                ))}
                <th className="total-column">{t('craftCalculator.totalHeader')}</th>
              </tr>
            </thead>
            <tbody>
              {materialRows.map((row) => (
                <tr key={row.materialId}>
                  <td className="material-cell">
                    {row.imageUrl && (
                      <ItemIcon itemId={row.materialId} name={row.materialName} icon={row.imageUrl} rarity={row.rarity} showName={false} style={{ '--item-icon-size': '24px' } as React.CSSProperties} />
                    )}
                    <span>{row.materialName}</span>
                  </td>
                  {row.tierAmounts.map((amount, idx) => (
                    <td key={idx} className="amount-cell">
                      {amount > 0 ? amount : '—'}
                    </td>
                  ))}
                  <td className="amount-cell total-cell">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
