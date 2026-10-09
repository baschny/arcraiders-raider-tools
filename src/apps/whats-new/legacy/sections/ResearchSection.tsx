import { useMemo, useState } from 'react';
import { useLocale } from '../../../../shared/context/LocaleContext';
import { FlowStrip, GamePanel, ItemChip, RecipeRow, SectionHeader } from '../components';
import type { AmountRef, ItemRef } from '../components';
import { buildResearchData, type ResearchData, type ResearchedBlueprint } from './research/data';
import type { SectionProps } from './types';

type T = (key: string) => string;
type Tm = (key: string, replacements: Record<string, string | number>) => string;

function RpStrip({ rd, t }: { rd: ResearchData; t: T }) {
  return (
    <div className="wn-research__acquire">
      <h3 className="wn-research__heading">{t('whatsNew.research.acquire')}</h3>
      <div className="wn-research__study">
        {rd.study.map((s) => (
          <div className="wn-research__study-item" key={s.item.id}>
            <ItemChip item={s.item} showName />
            <span className="wn-research__badge">{s.rp} RP</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StationLevels({ rd, t, tm }: { rd: ResearchData; t: T; tm: Tm }) {
  return (
    <div className="wn-research__levels">
      <h3 className="wn-research__heading">{t('whatsNew.research.station')}</h3>
      <ol className="wn-research__level-list">
        {rd.levels.map((l) => (
          <li className="wn-research__level" key={l.level}>
            <div className="wn-research__level-head">
              {l.icon && <img className="wn-research__level-img" src={l.icon} alt="" loading="lazy" />}
              <span className="wn-research__level-name">
                {l.level === 1 ? t('whatsNew.research.build') : tm('whatsNew.research.level', { n: l.level })}
              </span>
              {l.rooms !== undefined && (
                <span className="wn-research__tag">{tm('whatsNew.research.rooms', { n: l.rooms })}</span>
              )}
            </div>
            <div className="wn-research__level-cost">
              {l.cost.map((a: AmountRef) => (
                <ItemChip key={a.item.id} item={a.item} quantity={a.quantity} size="sm" />
              ))}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Tracks({ rd, t, tm }: { rd: ResearchData; t: T; tm: Tm }) {
  return (
    <div className="wn-research__tracks">
      <div className="wn-research__track">
        <span className="wn-research__track-name">{t('whatsNew.research.blueprintCrafting')}</span>
        <span className="wn-research__badge">{tm('whatsNew.research.plans', { n: rd.blueprintCount })}</span>
      </div>
      <div className="wn-research__track">
        <span className="wn-research__track-name">{t('whatsNew.research.designCrafting')}</span>
        <span className="wn-research__badge">{tm('whatsNew.research.plans', { n: rd.designCount })}</span>
      </div>
      <div className="wn-research__track wn-research__track--locked">
        <span className="wn-research__track-name">{t('whatsNew.research.amplifiedResearch')}</span>
        <span className="wn-research__badge">{rd.amplifiedCount}</span>
        <span className="wn-research__tag">{tm('whatsNew.research.requiresLevel', { n: rd.amplifiedLevel })}</span>
      </div>
    </div>
  );
}

function BlueprintLists({ rd, t }: { rd: ResearchData; t: T }) {
  const [selected, setSelected] = useState<string | null>(null);
  const current: ResearchedBlueprint | undefined = rd.craftable.find((c) => c.offerId === selected);
  const outputs: AmountRef[] = current ? [{ item: current.unlocks }] : [];
  return (
    <div className="wn-research__lists">
      <div className="wn-research__list">
        <h3 className="wn-research__heading">{t('whatsNew.research.craftable')}</h3>
        <div className="wn-research__grid">
          {rd.craftable.map((c) => (
            <ItemChip
              key={c.offerId}
              item={c.unlocks}
              isBlueprint
              size="md"
              marker={c.isNew ? 'new' : undefined}
              className={c.offerId === selected ? 'wn-research__chip--selected' : undefined}
              onClick={() => setSelected(c.offerId === selected ? null : c.offerId)}
            >
              <span className="wn-research__chip-rp">{c.rp}</span>
              <span className="wn-research__chip-level">L{c.level}</span>
            </ItemChip>
          ))}
        </div>
        {current && (
          <div className="wn-research__recipe">
            <RecipeRow inputs={current.inputs} outputs={outputs} label={current.unlocks.name} />
          </div>
        )}
      </div>
      <div className="wn-research__list">
        <h3 className="wn-research__heading">{t('whatsNew.research.findOnly')}</h3>
        <div className="wn-research__grid">
          {rd.findOnly.map((item: ItemRef) => (
            <ItemChip key={item.id} item={item} isBlueprint size="md" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ResearchSection({ data, variant }: SectionProps) {
  const { t, tm } = useLocale();
  const rd = useMemo(() => buildResearchData(data), [data]);
  const [open, setOpen] = useState(false);

  const header = (
    <SectionHeader id="research" title={t('whatsNew.section.research.title')} subtitle={t('whatsNew.section.research.subtitle')} />
  );

  if (variant === 'b') {
    return (
      <section className="wn-section wn-research wn-research--b" aria-labelledby="research">
        {header}
        <div className="wn-section__body">
          <RpStrip rd={rd} t={t} />
          <div className="wn-research__tiles">
            <GamePanel title={t('whatsNew.research.blueprintCrafting')} counter={tm('whatsNew.research.plans', { n: rd.blueprintCount })}>
              <button type="button" className="wn-research__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
                {open ? t('whatsNew.research.hide') : t('whatsNew.research.show')}
              </button>
            </GamePanel>
            <GamePanel title={t('whatsNew.research.designCrafting')} counter={tm('whatsNew.research.plans', { n: rd.designCount })} />
            <GamePanel
              title={t('whatsNew.research.amplifiedResearch')}
              counter={String(rd.amplifiedCount)}
              locked
              lockedReason={tm('whatsNew.research.requiresLevel', { n: rd.amplifiedLevel })}
            />
          </div>
          {open && <BlueprintLists rd={rd} t={t} />}
          <StationLevels rd={rd} t={t} tm={tm} />
        </div>
      </section>
    );
  }

  const trackIcons = [rd.samples.blueprint, rd.samples.design, rd.samples.amplified]
    .filter((i): i is ItemRef => !!i)
    .map((item) => ({ item, size: 'md' as const }));
  return (
    <section className="wn-section wn-research wn-research--a" aria-labelledby="research">
      {header}
      <div className="wn-section__body">
        <FlowStrip
          steps={[
            {
              items: rd.study.map((s) => ({
                item: s.item,
                size: 'sm' as const,
                children: <span className="wn-research__chip-rp">{s.rp}</span>,
              })),
            },
            { items: [{ item: rd.rp, size: 'md' as const }] },
            { items: trackIcons },
          ]}
        />
        <Tracks rd={rd} t={t} tm={tm} />
        <StationLevels rd={rd} t={t} tm={tm} />
        <BlueprintLists rd={rd} t={t} />
      </div>
    </section>
  );
}
