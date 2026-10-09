import { useMemo, useState } from 'react';
import { useLocale } from '../../../shared/context/LocaleContext';
import { HowItWorks, ItemGrid, ItemTile, NeedsCard, Panel, TabIntro } from '../components';
import type { ItemRef, TileSpec } from '../components';
import { toItemRef, type WhatsNewPageData } from '../hooks/useWhatsNewData';
import { fragmentInfo, groupByModule } from './amplified/model';
import type { WeaponRow } from './amplified/derive';
import { AmplificationPicker } from './amplified/AmplificationPicker';
import { HexGlyph } from './amplified/AmplificationGraph';
import { buildResearchHover, ResearchHoverContext } from './amplified/researchHoverData';
import type { AmplifiedWeapon, TextTree } from '../../../shared/gamedata/types';

export interface AmplifiedTabProps {
  data: WhatsNewPageData;
}

type RefFn = (slug: string) => ItemRef;

/** Amplified variants always carry the Amplified (orange) rarity frame. */
const amplified = (item: ItemRef): ItemRef => ({ ...item, rarity: 'Amplified' });

function WeaponDetail({ weapon, ref_, structure, text }: { weapon: WeaponRow; ref_: RefFn; structure?: AmplifiedWeapon; text?: TextTree }) {
  const base = ref_(weapon.fromItemId);
  const result = amplified(ref_(weapon.amplifiedId));
  return (
    <div className="wn-amp__detail">
      <div className="wn-amp__flow">
        <ItemTile item={base} size={64} />
        <span className="wn-amp__op" aria-hidden="true">+</span>
        <ItemTile item={ref_(weapon.moduleId)} size={64} />
        <span className="wn-amp__op" aria-hidden="true">→</span>
        <ItemTile item={result} size={64} />
      </div>
      {structure && <AmplificationPicker key={weapon.baseId} weapon={structure} text={text} ref_={ref_} root={result} />}
    </div>
  );
}

export function AmplifiedTab({ data }: AmplifiedTabProps) {
  const { t, tm, formatNumber } = useLocale();
  const researchHover = useMemo(() => (id: string) => buildResearchHover(data, tm, formatNumber, id), [data, tm, formatNumber]);
  const { catalog } = data;
  const ref = (slug: string) => toItemRef(catalog, slug);

  const groups = useMemo(() => groupByModule(data.amplification.structure, catalog), [data.amplification.structure, catalog]);
  const allWeapons = useMemo(() => groups.flatMap((g) => g.weapons), [groups]);
  // undefined = nothing chosen yet, so the first weapon is open; null = the user closed the panel.
  const [selectedId, setSelectedId] = useState<string | null | undefined>(undefined);
  const openId = selectedId === undefined ? allWeapons[0]?.baseId ?? null : selectedId;
  const selected = allWeapons.find((w) => w.baseId === openId) ?? allWeapons[0];

  const bench = data.benches.structure.benches.weapon_bench;
  const level4 = bench?.levels.find((l) => l.level === 4);
  const rooms = level4?.requires?.find((r) => r.kind === 'outpostLevel')?.id;
  const benchRef: ItemRef | undefined =
    bench && level4 ? { id: `${bench.id}-level-4`, name: `${bench.nameEn} ${t('whatsNew.amplified.level')} 4`, icon: level4.icon ?? undefined } : undefined;
  const { fragmentsId, recycles } = fragmentInfo(data.amplification.structure, catalog, allWeapons[0]?.moduleId);

  const researchLevel4 = data.benches.structure.benches.research_station?.levels.find((l) => l.level === 4);
  const sampleAmp = data.amplification.structure.weapons[selected?.baseId ?? '']?.amplifications?.find((a) => a.icon);
  const steps = [
    { image: level4?.icon ?? undefined, text: t('whatsNew.amplified.step1') },
    ...(selected ? [{ item: amplified(ref(selected.amplifiedId)), text: t('whatsNew.amplified.step2') }] : []),
    { image: researchLevel4?.icon ?? undefined, text: t('whatsNew.amplified.stepResearch') },
    {
      media: (
        <span className="wn-hex is-chosen wn-hex--step" aria-hidden="true">
          <span className="wn-hex__shape"><HexGlyph icon={sampleAmp?.icon} /></span>
        </span>
      ),
      text: t('whatsNew.amplified.step3'),
    },
  ];

  return (
    <ResearchHoverContext.Provider value={researchHover}>
    <div className="wn-tab wn-tab-amplified">
      <TabIntro title={t('whatsNew.intro.amplified.title')} sentence={t('whatsNew.intro.amplified.sentence')} />
      <HowItWorks steps={steps} />

      {benchRef && level4 && (
        <NeedsCard
          result={{ item: benchRef }}
          where={{ image: level4.icon ?? undefined, label: bench.nameEn }}
          needs={(level4.buildCost ?? []).map((c): TileSpec => ({ item: ref(c.itemId), amount: c.quantity }))}
          note={rooms ? t('whatsNew.amplified.roomsNote').replace('{n}', rooms) : undefined}
        />
      )}

      <Panel title={t('whatsNew.amplified.pickerTitle')} description={t('whatsNew.amplified.pickerSentence')}>
        <div className="wn-amp__groups">
          {groups.map(({ moduleId, weapons }) => (
            <section key={moduleId} className="wn-amp__group" aria-label={ref(moduleId).name}>
              <header className="wn-amp__group-head">
                <ItemTile item={ref(moduleId)} size={64} hideName />
                <h4 className="wn-amp__group-name">{ref(moduleId).name}</h4>
              </header>
              <ItemGrid
                items={weapons}
                getKey={(w) => w.baseId}
                getDetailLabel={(w) => ref(w.fromItemId).name}
                selectedKey={openId}
                onSelectedKeyChange={setSelectedId}
                renderTile={(w, { selected: isSelected, toggle }) => (
                  <ItemTile
                    item={ref(w.fromItemId)}
                    size={80}
                    selected={isSelected}
                    onClick={toggle}
                  />
                )}
                renderDetail={(w) => (
                  <WeaponDetail
                    weapon={w}
                    ref_={ref}
                    structure={data.amplification.structure.weapons[w.baseId]}
                    text={data.amplification.text?.[w.baseId] as TextTree | undefined}
                  />
                )}
              />
            </section>
          ))}
        </div>
      </Panel>

      {fragmentsId && (
        <div className="wn-amp__footer">
          <ItemTile item={ref(fragmentsId)} size={48} hideName />
          <ItemTile item={ref(selected?.moduleId ?? allWeapons[0]?.moduleId ?? '')} size={48} hideName />
          <span>
            {t('whatsNew.amplified.repairLine')}{' '}
            {recycles ? t('whatsNew.amplified.recycleLine').replace('{n}', String(recycles)) : ''}
          </span>
        </div>
      )}
    </div>
    </ResearchHoverContext.Provider>
  );
}
