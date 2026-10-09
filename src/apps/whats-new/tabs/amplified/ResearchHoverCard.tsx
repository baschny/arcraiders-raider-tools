import { useContext, type ReactElement } from 'react';
import { ItemHoverCard } from '../../components';
import { ResearchHoverContext } from './researchHoverData';

/** Wraps a trigger (research badge or tile) with the research hover card when content exists. */
export function ResearchHover({ researchItemId, children }: { researchItemId: string; children: ReactElement }) {
  const build = useContext(ResearchHoverContext);
  const content = build?.(researchItemId);
  if (!content) return children;
  return (
    <ItemHoverCard item={content.item} subtitle={content.subtitle} sections={content.sections}>
      {children}
    </ItemHoverCard>
  );
}
