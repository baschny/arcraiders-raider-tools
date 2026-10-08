import { SectionScaffold } from './SectionScaffold';
import type { SectionProps } from './types';

export function NewItemsSection(props: SectionProps) {
  return <SectionScaffold anchor="new-items" {...props} />;
}
