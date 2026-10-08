import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from '../../../shared/context/LocaleContext';
import type { WhatsNewNewItem, WhatsNewVerdict } from '../../../shared/gamedata/types';
import { ItemChip, SectionHeader, VerdictBadge } from '../components';
import { toItemRef, type WhatsNewPageData } from '../hooks/useWhatsNewData';
import type { SectionProps } from './types';
import { RefIcon } from './shared/RefIcon';
import { resolveTarget, resolveVia } from './shared/refs';
import { systemInfo } from './shared/systems';
import { capList, collapseRows, countBy, filterNewItems, groupBySystem, sortNewItems, VERDICT_ORDER } from './shared/uses';

const ANCHOR = 'new-items';
const GROUPS = ['material', 'gadget', 'study', 'key', 'module', 'perkPart', 'quest', 'blueprint', 'other'];
const MAX_TARGETS = 8;
const DEFAULT_COLS = 4;

function Chip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button type="button" className={`wn-new-items__chip${active ? ' is-active' : ''}`} aria-pressed={active} onClick={onClick}>
      {label}
      <span className="wn-new-items__chip-count">{count}</span>
    </button>
  );
}

function UsePanel({ item, data, onClose }: { item: WhatsNewNewItem; data: WhatsNewPageData; onClose: () => void }) {
  const { t } = useLocale();
  const ref = toItemRef(data.catalog, item.id);
  const groups = groupBySystem(item.uses);
  return (
    <div className="wn-new-items__panel" role="region" aria-label={ref.name}>
      <div className="wn-new-items__panel-head">
        <ItemChip item={ref} size="lg" />
        <div className="wn-new-items__panel-title">
          <strong>{ref.name}</strong>
          <VerdictBadge verdict={item.verdict} label={t(`whatsNew.new-items.verdict.${item.verdict}`)} count={item.keepCount} />
        </div>
        <button type="button" className="wn-new-items__close" onClick={onClose} aria-label={t('whatsNew.new-items.close')}>
          ×
        </button>
      </div>
      {groups.length === 0 && <p className="wn-new-items__none">{t('whatsNew.new-items.noUse')}</p>}
      {groups.map(({ system, uses }) => {
        const info = systemInfo(system);
        const Icon = info.icon;
        return (
          <div className="wn-new-items__system" key={system}>
            <span className="wn-new-items__system-label">
              <Icon size={14} aria-hidden="true" />
              {t(info.labelKey)}
            </span>
            <div className="wn-new-items__rows">
              {collapseRows(uses).map((row) => {
                const via = resolveVia(data, row.use);
                const { shown, more } = capList(row.targets, MAX_TARGETS);
                return (
                  <div className="wn-new-items__use" key={`${row.amount}|${row.use.via ? JSON.stringify(row.use.via) : ''}`}>
                    <span className="wn-new-items__amount">{row.amount}×</span>
                    <span aria-hidden="true">→</span>
                    <span className="wn-new-items__targets">
                      {shown.map((target) => {
                        const r = resolveTarget(data, { ...row.use, target });
                        return <RefIcon key={r.key} resolved={r} system={system} />;
                      })}
                      {more > 0 && <span className="wn-new-items__more">+{more}</span>}
                    </span>
                    {via && (
                      <span className="wn-new-items__via">
                        {via.kind === 'generic' ? <span>{via.label}</span> : <RefIcon resolved={via} />}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {item.recyclesInto && item.recyclesInto.length > 0 && (
        <div className="wn-new-items__system">
          <span className="wn-new-items__system-label">{t('whatsNew.new-items.recycles')}</span>
          <div className="wn-new-items__targets">
            {item.recyclesInto.map((a) => (
              <ItemChip key={a.itemId} item={toItemRef(data.catalog, a.itemId)} quantity={a.quantity} size="sm" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function NewItemsSection({ data }: SectionProps) {
  const { t } = useLocale();
  const all = useMemo(() => data.whatsNew?.versions['frozen-trail']?.newItems ?? [], [data.whatsNew]);
  const [verdict, setVerdict] = useState<WhatsNewVerdict | 'all'>('all');
  const [group, setGroup] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [cols, setCols] = useState(DEFAULT_COLS);
  const gridRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => sortNewItems(all, (id) => toItemRef(data.catalog, id)), [all, data.catalog]);
  const visible = useMemo(() => filterNewItems(sorted, verdict, group), [sorted, verdict, group]);
  const verdictCounts = countBy(filterNewItems(all, 'all', group), (i) => i.verdict);
  const groupCounts = countBy(filterNewItems(all, verdict, 'all'), (i) => i.group);

  useEffect(() => {
    const el = gridRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const n = getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length;
      if (n > 0) setCols(n);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const selIndex = visible.findIndex((i) => i.id === selected);
  const panelAfter = selIndex < 0 ? -1 : Math.min(visible.length - 1, (Math.floor(selIndex / cols) + 1) * cols - 1);

  return (
    <section className="wn-section wn-new-items" aria-labelledby={ANCHOR}>
      <SectionHeader id={ANCHOR} title={t('whatsNew.section.new-items.title')} subtitle={t('whatsNew.section.new-items.subtitle')} />
      <div className="wn-new-items__filters">
        <div className="wn-new-items__filter-row">
          <Chip active={verdict === 'all'} onClick={() => setVerdict('all')} label={t('whatsNew.new-items.all')} count={filterNewItems(all, 'all', group).length} />
          {VERDICT_ORDER.map((v) => (
            <Chip key={v} active={verdict === v} onClick={() => setVerdict(v)} label={t(`whatsNew.new-items.verdict.${v}`)} count={verdictCounts[v] ?? 0} />
          ))}
        </div>
        <div className="wn-new-items__filter-row">
          <Chip active={group === 'all'} onClick={() => setGroup('all')} label={t('whatsNew.new-items.all')} count={filterNewItems(all, verdict, 'all').length} />
          {GROUPS.filter((g) => groupCounts[g]).map((g) => (
            <Chip key={g} active={group === g} onClick={() => setGroup(g)} label={t(`whatsNew.new-items.group.${g}`)} count={groupCounts[g]} />
          ))}
        </div>
      </div>
      <div className="wn-new-items__grid" ref={gridRef}>
        {visible.flatMap((item, idx) => {
          const ref = toItemRef(data.catalog, item.id);
          const nodes = [
            <div className={`wn-new-items__tile${item.id === selected ? ' is-selected' : ''}`} key={item.id}>
              <ItemChip item={ref} size="md" showName onClick={() => setSelected(item.id === selected ? null : item.id)}>
                <VerdictBadge corner verdict={item.verdict} label={t(`whatsNew.new-items.verdict.${item.verdict}`)} count={item.keepCount} />
              </ItemChip>
            </div>,
          ];
          if (idx === panelAfter) {
            nodes.push(<UsePanel key={`panel-${selected}`} item={visible[selIndex]} data={data} onClose={() => setSelected(null)} />);
          }
          return nodes;
        })}
      </div>
    </section>
  );
}
