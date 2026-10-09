import { useLocale } from '../../../shared/context/LocaleContext';
import { ItemTile } from './ItemTile';
import type { TileSpec, WhereRef } from './types';

export interface NeedsCardProps {
  /** What is made (112 px tile; its name is shown beside it). */
  result: TileSpec;
  /** Bench or room that makes it. */
  where?: WhereRef;
  /** The "Needs" list (64 px tiles with amount and name). */
  needs: readonly TileSpec[];
  /** Unlock requirements (blueprint, research, rooms), 48 px tiles. */
  alsoNeeds?: readonly TileSpec[];
  /** Extra line under the heading block, e.g. "Needs 4 Outpost rooms". */
  note?: React.ReactNode;
  /**
   * 'full' (default): big result tile with its name beside it, the lists below.
   * 'compact': result tile (name under it) on the left, a divider, the "Needs" list on the right — for grids of recipes.
   */
  layout?: 'full' | 'compact';
  className?: string;
}

export function NeedsCard({ result, where, needs, alsoNeeds, note, layout = 'full', className }: NeedsCardProps) {
  const { t } = useLocale();
  if (layout === 'compact') {
    return (
      <article className={['wn-needs', 'wn-needs--compact', className ?? ''].filter(Boolean).join(' ')}>
        <div className="wn-needs__result">
          <ItemTile item={result.item} size={80} amount={result.amount} isBlueprint={result.isBlueprint} />
        </div>
        <div className="wn-needs__block">
          <h5 className="wn-needs__heading">{t('whatsNew.common.needs')}</h5>
          <div className="wn-needs__row">
            {needs.map((need, i) => (
              <ItemTile key={`${need.item.id}-${i}`} item={need.item} size={48} amount={need.amount} sublabel={need.sublabel} isBlueprint={need.isBlueprint} />
            ))}
          </div>
          {(where || note) && (
            <span className="wn-needs__sub">
              {where?.label}
              {where && note ? ' · ' : ''}
              {note}
            </span>
          )}
        </div>
      </article>
    );
  }
  return (
    <article className={['wn-needs', className ?? ''].filter(Boolean).join(' ')}>
      <header className="wn-needs__head">
        <ItemTile item={result.item} size={112} amount={result.amount} isBlueprint={result.isBlueprint} hideName />
        <div className="wn-needs__title">
          <h4 className="wn-needs__name">{result.item.name}</h4>
          {result.sublabel && <span className="wn-needs__sub">{result.sublabel}</span>}
          {where && (
            <span className="wn-needs__where">
              <span className="wn-needs__where-label">{t('whatsNew.common.where')}</span>
              {where.image && <img className="wn-needs__where-img" src={where.image} alt="" loading="lazy" />}
              <span>{where.label}</span>
            </span>
          )}
          {note && <span className="wn-needs__note">{note}</span>}
        </div>
      </header>
      {needs.length > 0 && (
        <div className="wn-needs__block">
          <h5 className="wn-needs__heading">{t('whatsNew.common.needs')}</h5>
          <div className="wn-needs__row">
            {needs.map((need, i) => (
              <ItemTile key={`${need.item.id}-${i}`} item={need.item} size={64} amount={need.amount} sublabel={need.sublabel} isBlueprint={need.isBlueprint} />
            ))}
          </div>
        </div>
      )}
      {alsoNeeds && alsoNeeds.length > 0 && (
        <div className="wn-needs__block wn-needs__block--also">
          <h5 className="wn-needs__heading">{t('whatsNew.common.alsoNeeds')}</h5>
          <div className="wn-needs__row">
            {alsoNeeds.map((need, i) => (
              <ItemTile key={`${need.item.id}-${i}`} item={need.item} size={48} amount={need.amount} sublabel={need.sublabel} isBlueprint={need.isBlueprint} />
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
