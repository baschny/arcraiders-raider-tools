import { ListTodo } from 'lucide-react';
import { useLocale } from '../../../../shared/context/LocaleContext';
import { GlyphIcon, ItemTile } from '../../components';
import { HoverTile } from './HoverTile';
import type { HoverContext, HoverSource } from './hover';
import type { UnlockCard } from './model';

export interface UnlockCardsProps {
  ctx: HoverContext;
  cards: readonly UnlockCard[];
  sources: ReadonlyMap<string, HoverSource>;
}

/** One-time unlocks: per unlock a card with the items it needs (80 px tiles, amount under the icon). */
export function UnlockCards({ ctx, cards, sources }: UnlockCardsProps) {
  const { t } = useLocale();
  return (
    <div className="wn-uc-grid">
      {cards.map((card) => (
        <article className="wn-uc" key={card.id} aria-labelledby={`wn-uc-${card.id}`}>
          <header className="wn-uc__head">
            <span className="wn-uc__media">
              {card.image ? (
                <img className="wn-uc__img" src={card.image} alt="" loading="lazy" />
              ) : card.quest ? (
                <ListTodo size={32} aria-hidden="true" />
              ) : card.glyph ? (
                <GlyphIcon name={card.glyph} size={32} />
              ) : null}
            </span>
            <h4 className="wn-uc__title" id={`wn-uc-${card.id}`}>{card.title}</h4>
          </header>
          <div className="wn-uc__items">
            {card.items.map((item) => (
              <HoverTile key={item.id} ctx={ctx} source={sources.get(item.id) ?? { id: item.id }} size={80} amount={item.amount} />
            ))}
          </div>
          {card.rooms && card.rooms.length > 0 && (
            <div className="wn-uc__rooms">
              <span className="wn-uc__rooms-label">{t('whatsNew.outpost.pickOne')}</span>
              <div className="wn-uc__rooms-list">
                {card.rooms.map((room) => (
                  <ItemTile key={room.id} item={room} size={48} />
                ))}
              </div>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
