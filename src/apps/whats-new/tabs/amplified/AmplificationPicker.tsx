import { useState } from 'react';
import { useLocale } from '../../../../shared/context/LocaleContext';
import type { Amplification, AmplificationEffect, AmplifiedWeapon, TextTree } from '../../../../shared/gamedata/types';
import { ItemTile } from '../../components';
import type { ItemRef } from '../../components';
import { humanize } from './derive';
import { AmplificationGraph, HexGlyph } from './AmplificationGraph';
import { ResearchHover } from './ResearchHoverCard';
import { canSelect, excludesOf, requiresOf, toggle } from './picker';


type RefFn = (slug: string) => ItemRef;

export interface AmplificationPickerProps {
  weapon: AmplifiedWeapon;
  /** Localized text of this weapon from the amplification domain text. */
  text?: TextTree | Record<string, unknown>;
  ref_: RefFn;
  /** The Amplified weapon, shown as the root of the graph. */
  root: ItemRef;
}

function textAt(tree: unknown, path: string[]): string | undefined {
  let node = tree;
  for (const key of path) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return typeof node === 'string' ? node : undefined;
}

interface EffectLine {
  sign: '+' | '−' | '';
  negative: boolean;
  body: string;
}

function EffectList({ lines }: { lines: EffectLine[] }) {
  const shown = lines;
  return (
    <ul className="wn-pick__effects">
      {shown.map((line, i) => (
        <li key={i} className={line.negative ? 'is-negative' : 'is-positive'}>
          <span className="wn-pick__sign" aria-hidden="true">{line.sign}</span>
          {line.body}
        </li>
      ))}
    </ul>
  );
}

export function AmplificationPicker({ weapon, text, ref_, root }: AmplificationPickerProps) {
  const { t, tm, formatNumber } = useLocale();
  const [selected, setSelected] = useState<string[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);

  const nameOf = (id: string) => textAt(text, ['amplifications', id, 'name']) ?? humanize(id);
  const effectLines = (amp: Amplification): EffectLine[] =>
    (amp.effects ?? []).flatMap((effect: AmplificationEffect, i) => {
      const raw = textAt(text, ['amplifications', amp.id, 'effects', String(i)]);
      if (!raw) return [];
      const body = raw.replace('{0}', effect.value === null ? '' : formatNumber(effect.value, { maximumFractionDigits: 2 }));
      const negative = effect.type === 'negative';
      // The game text sometimes carries its own sign ("+{0}s Burn Duration", "Burn damage +{0}/s"): never show it twice.
      const own = /^\s*[+\-−]\s*/.exec(body);
      const inner = !own && /[+\-−]\s*\{0\}/.test(raw);
      const sign: EffectLine['sign'] = own ? (/[-−]/.test(own[0]) ? '−' : '+') : negative ? '−' : '+';
      return [{ sign: inner ? '' : sign, negative, body: own ? body.slice(own[0].length) : body }];
    });

  return (
    <section className="wn-pick" aria-label={t('whatsNew.amplified.amplification')}>
      <AmplificationGraph
        weapon={weapon}
        selected={selected}
        root={root}
        nameOf={nameOf}
        onToggle={(id) => {
          const amp = weapon.amplifications.find((x) => x.id === id);
          if (amp) setSelected((s) => toggle(s, amp, weapon));
        }}
        hovered={hovered}
        onHover={setHovered}
      />

      <div className="wn-pick__cards">
        {weapon.amplifications.map((amp) => {
          const chosen = selected.includes(amp.id);
          const check = canSelect(selected, amp, weapon);
          const blocked = !chosen && !check.ok && check.reason !== 'requires';
          const lines = effectLines(amp);
          const description = textAt(text, ['amplifications', amp.id, 'description']);
          const cost = amp.variantStep?.cost && 'items' in amp.variantStep.cost ? amp.variantStep.cost.items : [];
          const researchRef = amp.researchItemId ? ref_(amp.researchItemId) : undefined;
          const excludes = excludesOf(amp).map(nameOf);
          return (
            <div
              key={amp.id}
              className={['wn-pick__card', chosen ? 'is-chosen' : '', blocked ? 'is-blocked' : '', hovered === amp.id ? 'is-hover' : ''].filter(Boolean).join(' ')}
              onMouseEnter={() => setHovered(amp.id)}
              onMouseLeave={() => setHovered(null)}
            >
              <div className="wn-pick__body">
                <div className="wn-pick__top">
                  <span className="wn-hex wn-hex--small" aria-hidden="true">
                    <span className="wn-hex__shape"><HexGlyph icon={amp.icon} /></span>
                  </span>
                  <span className="wn-pick__name">{nameOf(amp.id)}</span>
                </div>
                {description && <p className="wn-pick__desc">{description}</p>}
                {lines.length > 0 && <EffectList lines={lines} />}
                {(requiresOf(amp).length > 0 || excludes.length > 0) && (
                  <div className="wn-pick__rules">
                    {requiresOf(amp).length > 0 && (
                      <span className="wn-pick__chip">{tm('whatsNew.amplified.requires', { name: requiresOf(amp).map(nameOf).join(', ') })}</span>
                    )}
                    {excludes.length > 0 && (
                      <span className="wn-pick__chip">{tm('whatsNew.amplified.cantCombine', { names: excludes.join(', ') })}</span>
                    )}
                  </div>
                )}
                <div className="wn-pick__needs">
                  <span className="wn-pick__label">{t('whatsNew.common.needs')}</span>
                  <span className="wn-pick__tiles">
                    {cost.map((p) => (
                      <ItemTile key={p.itemId} item={ref_(p.itemId)} size={48} amount={p.quantity} />
                    ))}
                  </span>
                </div>
                <div className="wn-pick__needs">
                  <span className="wn-pick__label">{t('whatsNew.amplified.research')}</span>
                  {researchRef && amp.researchItemId ? (
                    <ResearchHover researchItemId={amp.researchItemId}>
                      <ItemTile item={researchRef} size={48} />
                    </ResearchHover>
                  ) : <span className="wn-pick__none">{t('whatsNew.amplified.noResearch')}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
