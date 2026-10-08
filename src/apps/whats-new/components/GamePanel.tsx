import React from 'react';
import { Lock } from 'lucide-react';

export interface GamePanelProps {
  title: string;
  backgroundImage?: string;
  /** Counter text, e.g. "3/6". */
  counter?: string;
  locked?: boolean;
  lockedReason?: string;
  children?: React.ReactNode;
  className?: string;
}

export function GamePanel({ title, backgroundImage, counter, locked = false, lockedReason, children, className }: GamePanelProps) {
  const style = backgroundImage ? ({ backgroundImage: `url("${backgroundImage}")` } as React.CSSProperties) : undefined;
  return (
    <section
      className={['wn-panel', locked ? 'wn-panel--locked' : '', backgroundImage ? 'wn-panel--image' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      <header className="wn-panel__head">
        <h3 className="wn-panel__title">{title}</h3>
        {counter && <span className="wn-panel__counter">{counter}</span>}
      </header>
      {locked && (
        <div className="wn-panel__lock">
          <Lock size={16} aria-hidden="true" />
          {lockedReason && <span>{lockedReason}</span>}
        </div>
      )}
      {children && <div className="wn-panel__body">{children}</div>}
    </section>
  );
}
