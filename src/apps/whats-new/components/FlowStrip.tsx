import { ItemChip } from './ItemChip';
import type { ItemChipProps } from './ItemChip';

export type FlowStep = { title?: string; items?: ItemChipProps[]; image?: string; note?: string };

export interface FlowStripProps {
  steps: FlowStep[];
}

export function FlowStrip({ steps }: FlowStripProps) {
  return (
    <ol className="wn-flow">
      {steps.map((step, i) => (
        <li className="wn-flow__step" key={i}>
          {i > 0 && <span className="wn-flow__arrow" aria-hidden="true">→</span>}
          <div className="wn-flow__body">
            {step.title && <div className="wn-flow__title">{step.title}</div>}
            {step.image && <img className="wn-flow__image" src={step.image} alt={step.title ?? ''} loading="lazy" />}
            {step.items && step.items.length > 0 && (
              <div className="wn-flow__items">
                {step.items.map((chip, j) => (
                  <ItemChip key={`${chip.item.id}-${j}`} {...chip} />
                ))}
              </div>
            )}
            {step.note && <div className="wn-flow__note">{step.note}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
