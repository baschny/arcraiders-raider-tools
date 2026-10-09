import { useId, useState } from 'react';
import { useLocale } from '../../../../shared/context/LocaleContext';
import type { Amplification, AmplificationEffect, AmplifiedWeapon, TextTree } from '../../../../shared/gamedata/types';
import { ItemTile } from '../../components';
import type { ItemRef } from '../../components';
import { humanize } from './derive';
import { canSelect, excludesOf, requiresOf, researchNeeded, toggle, totalParts, type LockReason } from './picker';

const MAX_EFFECTS = 4;

type RefFn = (slug: string) => ItemRef;

export interface AmplificationPickerProps {
  weapon: AmplifiedWeapon;
  /** Localized text of this weapon from the amplification domain text. */
  text?: TextTree | Record<string, unknown>;
  ref_: RefFn;
}

function textAt(tree: unknown, path: string[]): string | undefined {
  let node = tree;
  for (const key of path) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return typeof node === 'string' ? node : undefined;
}

/** The game glyph of an Amplification: white mask on an orange-tinted square. */
function AmpGlyph({ icon }: { icon?: string }) {
  const url = icon ? `url("${icon}")` : undefined;
  return (
    <span className="wn-pick__glyph" aria-hidden="true">
      {url && <span className="wn-pick__glyph-img" style={{ maskImage: url, WebkitMaskImage: url }} />}
    </span>
  );
}

interface EffectLine {
  sign: '+' | '−' | '';
  negative: boolean;
  body: string;
}

function EffectList({ lines, expanded }: { lines: EffectLine[]; expanded: boolean }) {
  const shown = expanded ? lines : lines.slice(0, MAX_EFFECTS);
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

export function AmplificationPicker({ weapon, text, ref_ }: AmplificationPickerProps) {
  const { t, tm, formatNumber } = useLocale();
  const uid = useId();
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const max = weapon.maxAmplifications;

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

  const reasonLine = (reason: LockReason, by?: string): string => {
    if (reason === 'requires') return tm('whatsNew.amplified.lockedRequires', { name: nameOf(by ?? '') });
    if (reason === 'excluded') return by ? tm('whatsNew.amplified.lockedExcluded', { name: nameOf(by) }) : t('whatsNew.amplified.lockedUnavailable');
    return tm('whatsNew.amplified.lockedLimit', { k: selected.length, n: max });
  };

  const total = totalParts(selected, weapon);
  const research = researchNeeded(selected, weapon);

  return (
    <section className="wn-pick" aria-label={t('whatsNew.amplified.amplification')}>
      <header className="wn-pick__head">
        <h5 className="wn-pick__title">{tm(max === 1 ? 'whatsNew.amplified.chooseOne' : 'whatsNew.amplified.chooseUpTo', { n: max })}</h5>
        <span className="wn-pick__count" aria-live="polite">{tm('whatsNew.amplified.chosenCount', { k: selected.length, n: max })}</span>
        {selected.length > 0 && (
          <button type="button" className="wn-pick__reset" onClick={() => setSelected([])}>
            {t('whatsNew.amplified.reset')}
          </button>
        )}
      </header>

      <div className="wn-pick__cards">
        {weapon.amplifications.map((amp) => {
          const chosen = selected.includes(amp.id);
          const check = canSelect(selected, amp, weapon);
          const locked = !chosen && !check.ok;
          const lines = effectLines(amp);
          const open = expanded.has(amp.id);
          const description = textAt(text, ['amplifications', amp.id, 'description']);
          const cost = amp.variantStep?.cost && 'items' in amp.variantStep.cost ? amp.variantStep.cost.items : [];
          const researchRef = amp.researchItemId ? ref_(amp.researchItemId) : undefined;
          const excludes = excludesOf(amp).map(nameOf);
          const descId = `${uid}-${amp.id}`;
          return (
            <div key={amp.id} className={['wn-pick__card', chosen ? 'is-chosen' : '', locked ? 'is-locked' : ''].filter(Boolean).join(' ')}>
              <button
                type="button"
                className="wn-pick__select"
                aria-pressed={chosen}
                aria-disabled={locked || undefined}
                aria-label={nameOf(amp.id)}
                aria-describedby={description ? descId : undefined}
                onClick={() => !locked && setSelected((s) => toggle(s, amp, weapon))}
              />
              <div className="wn-pick__body">
                <div className="wn-pick__top">
                  <AmpGlyph icon={amp.icon} />
                  <span className="wn-pick__name">{nameOf(amp.id)}</span>
                  {chosen && <span className="wn-pick__check" aria-hidden="true">✓</span>}
                </div>
                {description && <p id={descId} className="wn-pick__desc">{description}</p>}
                {lines.length > 0 && <EffectList lines={lines} expanded={open} />}
                {lines.length > MAX_EFFECTS && (
                  <button
                    type="button"
                    className="wn-pick__more"
                    aria-expanded={open}
                    onClick={() =>
                      setExpanded((s) => {
                        const next = new Set(s);
                        if (!next.delete(amp.id)) next.add(amp.id);
                        return next;
                      })
                    }
                  >
                    {open ? t('whatsNew.amplified.showLess') : tm('whatsNew.amplified.moreEffects', { n: lines.length - MAX_EFFECTS })}
                  </button>
                )}
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
                {locked && !check.ok && <p className="wn-pick__reason">{reasonLine(check.reason, check.by)}</p>}
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
                  {researchRef ? <ItemTile item={researchRef} size={48} /> : <span className="wn-pick__none">{t('whatsNew.amplified.noResearch')}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selected.length > 0 && (
        <div className="wn-pick__summary">
          <p className="wn-pick__build">
            <span className="wn-pick__label">{t('whatsNew.amplified.yourBuild')}</span> {selected.map(nameOf).join(' + ')}
          </p>
          {total.length > 0 && (
            <div className="wn-pick__needs">
              <span className="wn-pick__label">{t('whatsNew.amplified.total')}</span>
              <span className="wn-pick__tiles">
                {total.map((p) => (
                  <ItemTile key={p.itemId} item={ref_(p.itemId)} size={48} amount={p.quantity} />
                ))}
              </span>
            </div>
          )}
          <div className="wn-pick__needs">
            <span className="wn-pick__label">{t('whatsNew.amplified.research')}</span>
            {research.length > 0 ? (
              <span className="wn-pick__tiles">
                {research.map((id) => (
                  <ItemTile key={id} item={ref_(id)} size={48} />
                ))}
              </span>
            ) : (
              <span className="wn-pick__none">{t('whatsNew.amplified.noResearch')}</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
