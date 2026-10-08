import { useState } from 'react';
import { useLocale } from '../../../shared/context/LocaleContext';
import type { StencilsStructure } from '../../../shared/gamedata/types';
import { Counter, ItemChip, SectionHeader, VerdictBadge } from '../components';
import type { ItemRef } from '../components';
import { toItemRef } from '../hooks/useWhatsNewData';
import type { SectionProps } from './types';

const PARTS_ID = 'stencil_parts';
const SLOT_PREFIX = 'stencil_slot_';

/** Optional swatch images per stencil slug (filled by the stencil-art ticket). */
export const STENCIL_IMAGES: Record<string, string> = {};

export interface StencilEntry {
  id: string;
  cost: number;
  /** Weapon slugs (slot ids without the prefix). */
  weapons: string[];
}

/** Stencils grouped by Stencil Parts cost, ascending. Weapons come from `appliesTo`, else from the slots' `allowed` lists. */
export function buildStencilGroups(structure: StencilsStructure): Array<[number, StencilEntry[]]> {
  const { stencils, slots } = structure;
  const groups = new Map<number, StencilEntry[]>();
  for (const s of Object.values(stencils)) {
    const cost = (s.craft && 'items' in s.craft.cost ? s.craft.cost.items.find((c) => c.itemId === PARTS_ID)?.quantity : undefined) ?? 0;
    let weapons = s.appliesTo;
    if (!weapons?.length) {
      weapons = Object.values(slots)
        .filter((slot) => slot.allowed?.includes(s.id))
        .map((slot) => slot.id.replace(SLOT_PREFIX, ''));
      if (!weapons.length && s.slotId) weapons = [s.slotId.replace(SLOT_PREFIX, '')];
    }
    const list = groups.get(cost) ?? [];
    list.push({ id: s.id, cost, weapons });
    groups.set(cost, list);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]);
}

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
        right={<Counter label={t('whatsNew.stencils.counter')} value={total} total={total} />}
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
