import React from 'react';

export interface PanelProps {
  title?: React.ReactNode;
  /** Right-aligned content in the header (a counter, a SegmentedControl). */
  aside?: React.ReactNode;
  /** One sentence under the title. */
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  /** Draws the 1 px accent border ("selected" / "new"). */
  highlighted?: boolean;
}

export function Panel({ title, aside, description, children, className, highlighted }: PanelProps) {
  const classes = ['wn-panel', highlighted ? 'wn-panel--highlighted' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <section className={classes}>
      {(title || aside) && (
        <header className="wn-panel__head">
          {title && <h3 className="wn-panel__title">{title}</h3>}
          {aside && <div className="wn-panel__aside">{aside}</div>}
        </header>
      )}
      {description && <p className="wn-panel__desc">{description}</p>}
      {children}
    </section>
  );
}
