import { ItemIcon } from '../../../shared/components/ItemIcon';
import type { ItemRef } from './types';

export interface PurposeGroupProps {
  title: string;
  /** One sentence explaining the group. */
  sentence?: string;
  /** Bench / room image (80 px) ... */
  iconImage?: string;
  /** ... or a representative item (80 px). */
  iconItem?: ItemRef;
  id?: string;
  children: React.ReactNode;
}

export function PurposeGroup({ title, sentence, iconImage, iconItem, id, children }: PurposeGroupProps) {
  return (
    <section className="wn-group" aria-labelledby={id ? `${id}-title` : undefined} id={id}>
      <header className="wn-group__head">
        {(iconImage || iconItem) && (
          <span className="wn-group__icon" style={{ '--item-icon-size': '80px' } as React.CSSProperties}>
            {iconItem ? (
              <ItemIcon itemId={iconItem.id} name={iconItem.name} icon={iconItem.icon} rarity={iconItem.rarity} showName={false} />
            ) : (
              <img className="wn-group__img" src={iconImage} alt="" loading="lazy" />
            )}
          </span>
        )}
        <div className="wn-group__text">
          <h3 className="wn-group__title" id={id ? `${id}-title` : undefined}>{title}</h3>
          {sentence && <p className="wn-group__sentence">{sentence}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}
