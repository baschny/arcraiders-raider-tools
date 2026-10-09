import { ItemIcon } from '../../../shared/components/ItemIcon';
import { useLocale } from '../../../shared/context/LocaleContext';
import type { ItemRef } from './types';

export interface HowItWorksStep {
  /** An item icon (64 px) ... */
  item?: ItemRef;
  /** ... or an image URL (bench, room, currency), shown 64 px. */
  image?: string;
  /** One short line. */
  text: string;
  isBlueprint?: boolean;
}

export interface HowItWorksProps {
  /** 2 to 4 steps. */
  steps: readonly HowItWorksStep[];
  /** Heading; defaults to "How it works". */
  title?: string;
}

export function HowItWorks({ steps, title }: HowItWorksProps) {
  const { t } = useLocale();
  return (
    <section className="wn-how" aria-label={title ?? t('whatsNew.common.howItWorks')}>
      <h3 className="wn-how__title">{title ?? t('whatsNew.common.howItWorks')}</h3>
      <ol className="wn-how__steps">
        {steps.map((step, index) => (
          <li className="wn-how__step" key={`${index}-${step.text}`}>
            <span className="wn-how__num" aria-hidden="true">{index + 1}</span>
            <span className="wn-how__media" style={{ '--item-icon-size': '64px' } as React.CSSProperties}>
              {step.item && (
                <ItemIcon
                  itemId={step.item.id}
                  name={step.item.name}
                  icon={step.item.icon}
                  rarity={step.item.rarity}
                  isBlueprint={step.isBlueprint}
                  showName={false}
                />
              )}
              {!step.item && step.image && <img className="wn-how__img" src={step.image} alt="" loading="lazy" />}
            </span>
            <span className="wn-how__text">{step.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
