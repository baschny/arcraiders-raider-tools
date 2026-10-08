import React from 'react';

export interface SectionHeaderProps {
  id: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}

export function SectionHeader({ id, title, subtitle, right }: SectionHeaderProps) {
  return (
    <header className="wn-section-header" id={id}>
      <div className="wn-section-header__text">
        <h2 className="wn-section-header__title">{title}</h2>
        {subtitle && <p className="wn-section-header__subtitle">{subtitle}</p>}
      </div>
      {right && <div className="wn-section-header__right">{right}</div>}
    </header>
  );
}
