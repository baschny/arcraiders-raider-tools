import { useState } from 'react';
import { useLocale } from '../../../../shared/context/LocaleContext';
import { Counter, ItemChip, SectionHeader, VerdictBadge } from '../components';
import type { ItemRef } from '../components';
import { toItemRef } from '../../hooks/useWhatsNewData';
import type { SectionProps } from './types';
import { PARTS_ID, STENCIL_IMAGES, buildStencilGroups } from './stencils/data';

export function StencilsSection({ data }: SectionProps) {
  const { t, tm } = useLocale();
  const [open, setOpen] = useState<string | null>(null);
  const { catalog } = data;
  const groups = buildStencilGroups(data.stencils.structure);
  const total = groups.reduce((n, [, list]) => n + list.length, 0);
  const parts = toItemRef(catalog, PARTS_ID);

  const weaponRef = (slug: string): ItemRef => {
    const hit = [`${slug}_i`, slug].find((id) => catalog.items[id]);
    return toItemRef(catalog, hit ?? slug);
  };

  return (
    <section className="wn-section wn-stencils" aria-labelledby="stencils">
      <SectionHeader
        id="stencils"
        title={t('whatsNew.section.stencils.title')}
        subtitle={t('whatsNew.section.stencils.subtitle')}
        right={<Counter label={t('whatsNew.stencils.counter')} total={total} />}
      />
      <div className="wn-section__body">
        <div className="wn-stencils__parts">
          <ItemChip item={parts} size="lg" showName>
            <VerdictBadge verdict="keep" label={t('whatsNew.stencils.hold')} corner />
          </ItemChip>
          <span className="wn-stencils__parts-hint">{t('whatsNew.stencils.partsHint')}</span>
        </div>
        {groups.map(([cost, list]) => {
          const selected = list.find((s) => s.id === open);
          return (
            <div className="wn-stencils__group" key={cost}>
              <div className="wn-stencils__group-head">
                <ItemChip item={parts} size="sm" quantity={cost} />
                <span className="wn-stencils__group-cost">{tm('whatsNew.stencils.cost', { count: cost })}</span>
              </div>
              <div className="wn-stencils__tiles">
                {list.map((s) => {
                  const ref = toItemRef(catalog, s.id);
                  const image = STENCIL_IMAGES[s.id] ?? ref.icon;
                  const active = open === s.id;
                  return (
                    <button
                      type="button"
                      key={s.id}
                      className={`wn-stencils__tile${active ? ' wn-stencils__tile--active' : ''}`}
                      aria-expanded={active}
                      onClick={() => setOpen(active ? null : s.id)}
                    >
                      <span className="wn-stencils__swatch">
                        {image ? (
                          <img src={image} alt="" loading="lazy" />
                        ) : (
                          <span className="wn-stencils__swatch-fallback" aria-hidden="true" />
                        )}
                      </span>
                      <span className="wn-stencils__name">{ref.name}</span>
                      <span className="wn-stencils__found">{t('whatsNew.stencils.foundInRaid')}</span>
                    </button>
                  );
                })}
              </div>
              {selected && (
                <div className="wn-stencils__compat">
                  <span className="wn-stencils__compat-label">{t('whatsNew.stencils.compatible')}</span>
                  <div className="wn-stencils__compat-icons">
                    {selected.weapons.map((w) => (
                      <ItemChip key={w} item={weaponRef(w)} size="sm" showName />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
