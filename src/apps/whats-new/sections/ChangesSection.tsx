import { useLocale } from '../../../shared/context/LocaleContext';
import type { Amount, WhatsNewTradeLine } from '../../../shared/gamedata/types';
import { BeforeAfterRow, ItemChip, SectionHeader } from '../components';
import type { AmountRef, ItemRef } from '../components';
import {
  TRADER_PORTRAITS,
  benchTierRef,
  buildAnvilRows,
  anvilBaseName,
  buildStashTiers,
  compactNumber,
  groupRecycling,
  orderTraders,
  otherRecipes,
  romanTier,
  toItemRef,
  traderName,
  type AnvilRow,
} from './changes/data';
import type { SectionProps } from './types';

const ANCHOR = 'changes';

type Resolve = (slug: string) => ItemRef;

function refs(resolve: Resolve, amounts?: Amount[]): AmountRef[] {
  return (amounts ?? []).map((a) => ({ item: resolve(a.itemId), quantity: a.quantity }));
}

/** Price as currency icon and compact amount. Lists of several items are joined. */
function Price({ cost, scrap, resolve, dim }: { cost?: Amount[]; scrap?: number; resolve: Resolve; dim?: boolean }) {
  const parts = (cost ?? []).map((a) => ({ item: resolve(a.itemId), quantity: a.quantity }));
  return (
    <span className={`wn-changes__price${dim ? ' wn-changes__price--dim' : ''}`}>
      {parts.map((p, i) => (
        <span key={`${p.item.id}-${i}`} className="wn-changes__price-part" title={p.item.name}>
          {p.item.icon && <img src={p.item.icon} alt={p.item.name} loading="lazy" />}
          <span>{compactNumber(p.quantity)}</span>
        </span>
      ))}
      {scrap !== undefined && <span className="wn-changes__price-part">{`♻ ${compactNumber(scrap)}`}</span>}
    </span>
  );
}

function TradeUnit({ item, line, resolve, gone }: { item: ItemRef; line: WhatsNewTradeLine; resolve: Resolve; gone?: boolean }) {
  return (
    <div className={`wn-changes__trade${gone ? ' wn-changes__trade--gone' : ''}`}>
      <ItemChip item={item} size="sm" />
      <Price cost={line.cost} scrap={line.scrapValue} resolve={resolve} dim={gone} />
    </div>
  );
}

function AnvilCard({ rows, resolve, t }: { rows: AnvilRow[]; resolve: Resolve; t: (k: string) => string }) {
  const kinds = ['craft', 'upgrade', 'repair'] as const;
  return (
    <div className="wn-changes__card wn-changes__card--anvil">
      <div className="wn-changes__card-head">
        <ItemChip item={resolve('anvil_i')} size="md" showName={false} />
        <span className="wn-changes__card-title">{anvilBaseName(resolve('anvil_i').name)}</span>
      </div>
      {kinds.map((kind) => {
        const list = rows.filter((r) => r.kind === kind);
        if (!list.length) return null;
        return (
          <div key={kind} className="wn-changes__group">
            <div className="wn-changes__tag">{t(`whatsNew.changes.${kind}`)}</div>
            {list.map((r) => {
              const base = resolve(`anvil_${romanTier(r.tier).toLowerCase()}`);
              const title: ItemRef = {
                ...base,
                name: r.fromTier ? `${romanTier(r.fromTier)} → ${romanTier(r.tier)}` : romanTier(r.tier),
              };
              return <BeforeAfterRow key={`${kind}-${r.tier}`} title={title} before={refs(resolve, r.before)} after={refs(resolve, r.after)} />;
            })}
          </div>
        );
      })}
    </div>
  );
}

export function ChangesSection({ data }: SectionProps) {
  const { t } = useLocale();
  const changes = data.whatsNew?.versions['frozen-trail']?.changes;
  const resolve: Resolve = (slug) => toItemRef(data.catalog, slug);

  const anvilRows = buildAnvilRows(changes);
  const recipes = otherRecipes(changes);
  const recycling = groupRecycling(changes);
  const traders = orderTraders(changes?.traders).filter((tr) => tr.added?.length || tr.removed?.length || tr.priceChanged?.length);
  const stash = buildStashTiers(changes);

  return (
    <section className="wn-section wn-changes" aria-labelledby={ANCHOR}>
      <SectionHeader id={ANCHOR} title={t('whatsNew.section.changes.title')} subtitle={t('whatsNew.section.changes.subtitle')} />
      <div className="wn-section__body">
        {(recipes.length > 0 || anvilRows.length > 0) && (
          <div className="wn-changes__block">
            <h3 className="wn-changes__subhead">{t('whatsNew.changes.recipes')}</h3>
            <div className="wn-changes__list">
              {recipes.map((r) => (
                <div key={r.result} className="wn-changes__line">
                  <ItemChip item={benchTierRef(data, r.bench.bench, r.bench.level)} size="sm" className="wn-changes__bench" />
                  <BeforeAfterRow title={resolve(r.result)} before={refs(resolve, r.before)} after={refs(resolve, r.after)} />
                </div>
              ))}
              {anvilRows.length > 0 && <AnvilCard rows={anvilRows} resolve={resolve} t={t} />}
            </div>
          </div>
        )}

        {(recycling.rows.length > 0 || recycling.anvil.length > 0) && (
          <div className="wn-changes__block">
            <h3 className="wn-changes__subhead">{t('whatsNew.changes.recycling')}</h3>
            <div className="wn-changes__list">
              {recycling.rows.map((r) => (
                <BeforeAfterRow key={r.id} title={resolve(r.id)} before={refs(resolve, r.before)} after={refs(resolve, r.after)} />
              ))}
              {recycling.anvilUniform ? (
                <BeforeAfterRow
                  title={{ ...resolve('anvil_i'), name: `${anvilBaseName(resolve('anvil_i').name)} ${romanTier(1)}–${romanTier(4)}` }}
                  before={refs(resolve, recycling.anvil[0].before)}
                  after={refs(resolve, recycling.anvil[0].after)}
                />
              ) : (
                recycling.anvil.map((r) => (
                  <BeforeAfterRow
                    key={r.id}
                    title={{ ...resolve(r.id), name: resolve(r.id).name }}
                    before={refs(resolve, r.before)}
                    after={refs(resolve, r.after)}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {traders.length > 0 && (
          <div className="wn-changes__block">
            <h3 className="wn-changes__subhead">{t('whatsNew.changes.traders')}</h3>
            <div className="wn-changes__traders">
              {traders.map((tr) => (
                <div key={tr.npc} className="wn-changes__card wn-changes__trader" data-trader={tr.npc}>
                  <div className="wn-changes__card-head">
                    {TRADER_PORTRAITS[tr.npc] && <img className="wn-changes__portrait" src={TRADER_PORTRAITS[tr.npc]} alt="" loading="lazy" />}
                    <span className="wn-changes__card-title">{traderName(data, tr.npc)}</span>
                  </div>
                  {!!tr.added?.length && (
                    <div className="wn-changes__group wn-changes__group--new">
                      <div className="wn-changes__tag">{t('whatsNew.changes.new')}</div>
                      <div className="wn-changes__chips">
                        {tr.added.map((l, i) => (
                          <TradeUnit key={`${l.result}-${i}`} item={resolve(l.result)} line={l} resolve={resolve} />
                        ))}
                      </div>
                    </div>
                  )}
                  {!!tr.removed?.length && (
                    <div className="wn-changes__group wn-changes__group--gone">
                      <div className="wn-changes__tag">{t('whatsNew.changes.gone')}</div>
                      <div className="wn-changes__chips">
                        {tr.removed.map((l, i) => (
                          <TradeUnit key={`${l.result}-${i}`} item={resolve(l.result)} line={l} resolve={resolve} gone />
                        ))}
                      </div>
                    </div>
                  )}
                  {!!tr.priceChanged?.length && (
                    <div className="wn-changes__group">
                      <div className="wn-changes__tag">{t('whatsNew.changes.priceChanged')}</div>
                      <div className="wn-changes__chips">
                        {tr.priceChanged.map((p, i) => (
                          <div key={`${p.result}-${i}`} className="wn-changes__trade wn-changes__trade--change">
                            <ItemChip item={resolve(p.result)} size="sm" />
                            <span className="wn-changes__delta">
                              <Price cost={p.before} resolve={resolve} dim />
                              <span aria-hidden="true">→</span>
                              <Price cost={p.after} resolve={resolve} />
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {stash.length > 0 && (
          <div className="wn-changes__block">
            <h3 className="wn-changes__subhead">{t('whatsNew.changes.stash')}</h3>
            <ol className="wn-changes__ladder">
              {stash.map((s) => (
                <li key={s.from} className={`wn-changes__tier${s.isNew ? ' wn-changes__tier--new' : ''}`}>
                  <span className="wn-changes__slots">{s.to}</span>
                  <span className="wn-changes__slots-label">{t('whatsNew.changes.slots')}</span>
                  {s.isNew && <span className="wn-changes__tier-new">{t('whatsNew.changes.newTier')}</span>}
                  {!s.isNew && s.changed && <Price cost={s.before} resolve={resolve} dim />}
                  {!s.isNew && s.changed && <span aria-hidden="true">↓</span>}
                  <Price cost={s.after} resolve={resolve} />
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
