import { useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useLocale } from '../../../shared/context/LocaleContext';
import type { WhatsNewUse } from '../../../shared/gamedata/types';
import { ItemChip, SectionHeader } from '../components';
import { toItemRef, type WhatsNewPageData } from '../hooks/useWhatsNewData';
import type { SectionProps } from './types';
import { RefIcon } from './shared/RefIcon';
import { resolveTarget } from './shared/refs';
import { systemInfo } from './shared/systems';
import { capList, distinctTargets, groupBySystem, sortByImpact } from './shared/uses';

const ANCHOR = 'new-uses';
const TOP = 40;
const MAX_TARGETS = 6;

function UseChips({ uses, sign, data }: { uses: WhatsNewUse[] | undefined; sign: 'gain' | 'lose'; data: WhatsNewPageData }) {
  const { t } = useLocale();
  const Sign = sign === 'gain' ? Plus : Minus;
  return (
    <>
      {groupBySystem(uses).map(({ system, uses: list }) => {
        const info = systemInfo(system);
        const Icon = info.icon;
        const { shown, more } = capList(distinctTargets(list), MAX_TARGETS);
        return (
          <span className={`wn-new-uses__chip wn-new-uses__chip--${sign}`} key={system}>
            <Sign size={12} aria-hidden="true" />
            <span className="wn-new-uses__system" title={t(info.labelKey)}>
              <Icon size={14} aria-hidden="true" />
              <span>{t(info.labelKey)}</span>
            </span>
            {shown.map((target) => {
              const r = resolveTarget(data, { ...list[0], target });
              return <RefIcon key={r.key} resolved={r} system={system} />;
            })}
            {more > 0 && <span className="wn-new-uses__more">+{more}</span>}
          </span>
        );
      })}
    </>
  );
}

export function NewUsesSection({ data }: SectionProps) {
  const { t, tm } = useLocale();
  const [showAll, setShowAll] = useState(false);
  const all = data.whatsNew?.versions['frozen-trail']?.existingItems;
  const sorted = useMemo(() => sortByImpact(all ?? [], (id) => toItemRef(data.catalog, id)), [all, data.catalog]);
  const rows = showAll ? sorted : sorted.slice(0, TOP);

  return (
    <section className="wn-section wn-new-uses" aria-labelledby={ANCHOR}>
      <SectionHeader id={ANCHOR} title={t('whatsNew.section.new-uses.title')} subtitle={t('whatsNew.section.new-uses.subtitle')} />
      <div className="wn-new-uses__list">
        {rows.map((item) => {
          const ref = toItemRef(data.catalog, item.id);
          return (
            <div className="wn-new-uses__row" key={item.id}>
              <div className="wn-new-uses__item">
                <ItemChip item={ref} size="sm" />
                <span className="wn-new-uses__name">{ref.name}</span>
              </div>
              <div className="wn-new-uses__chips">
                <UseChips uses={item.gained} sign="gain" data={data} />
                <UseChips uses={item.lost} sign="lose" data={data} />
              </div>
            </div>
          );
        })}
      </div>
      {sorted.length > TOP && (
        <button type="button" className="wn-new-uses__toggle" onClick={() => setShowAll((v) => !v)}>
          {showAll ? t('whatsNew.new-uses.showLess') : tm('whatsNew.new-uses.showAll', { n: sorted.length })}
        </button>
      )}
    </section>
  );
}
