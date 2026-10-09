import { Info } from 'lucide-react';
import { useLocale } from '../../../../shared/context/LocaleContext';
import { ItemIcon } from '../../../../shared/components/ItemIcon';
import { toItemRef } from '../../hooks/useWhatsNewData';
import { formatRp, type HoverContext } from './hover';
import type { NewItemsModel } from './model';

export interface ResearchPointsExtrasProps {
  ctx: HoverContext;
  model: NewItemsModel;
}

/** Under the study items: the warning about their other uses, the RP scale and the conversion hint. */
export function ResearchPointsExtras({ ctx, model }: ResearchPointsExtrasProps) {
  const { t, tm } = useLocale();
  const { rpScale, studyCallout } = model;
  const scale = [
    rpScale.min && { id: 'min', rp: rpScale.min.rp, label: tm('whatsNew.new-items.rp.scaleMin', { name: rpScale.min.name }) },
    rpScale.median && { id: 'median', rp: rpScale.median.rp, label: t('whatsNew.new-items.rp.scaleMedian') },
    rpScale.max && { id: 'max', rp: rpScale.max.rp, label: tm('whatsNew.new-items.rp.scaleMax', { name: rpScale.max.name }) },
  ].filter((s): s is { id: string; rp: number; label: string } => !!s);

  return (
    <>
      {studyCallout.length > 0 && (
        <aside className="wn-callout" aria-label={t('whatsNew.new-items.rp.calloutTitle')}>
          <p className="wn-callout__text">
            <Info size={20} aria-hidden="true" />
            <span>{t('whatsNew.new-items.rp.callout')}</span>
          </p>
          <ul className="wn-callout__list">
            {studyCallout.map(({ id, rows }) => {
              const item = toItemRef(ctx.data.catalog, id);
              return (
                <li className="wn-callout__item" key={id}>
                  <ItemIcon itemId={item.id} name={item.name} icon={item.icon} rarity={item.rarity} showName={false} showQuantity={false} className="wn-callout__icon" />
                  <span>
                    {tm('whatsNew.new-items.rp.calloutUse', {
                      item: item.name,
                      uses: rows.map((r) => `${r.amount ?? ''} ${r.label}`.trim()).join(', '),
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        </aside>
      )}
      {scale.length > 0 && rpScale.min && rpScale.max && (
        <section className="wn-rpscale" aria-label={t('whatsNew.new-items.rp.scaleLabel')}>
          <h4 className="wn-rpscale__title">
            {tm('whatsNew.new-items.rp.scaleTitle', { min: formatRp(rpScale.min.rp), max: formatRp(rpScale.max.rp) })}
          </h4>
          <ol className="wn-rpscale__steps">
            {scale.map((s) => (
              <li className="wn-rpscale__step" key={s.id}>
                <span className="wn-rpscale__value">{tm('whatsNew.research.rpAmount', { n: formatRp(s.rp) })}</span>
                <span className="wn-rpscale__label">{s.label}</span>
              </li>
            ))}
          </ol>
          {rpScale.topStudy && (
            <p className="wn-rpscale__hint">
              {tm('whatsNew.new-items.rp.conversion', { item: rpScale.topStudy.item.name, rp: formatRp(rpScale.topStudy.rp) })}
            </p>
          )}
        </section>
      )}
    </>
  );
}
