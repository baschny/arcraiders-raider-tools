import { SectionScaffold } from './SectionScaffold';
import type { SectionProps } from './types';

export function NewUsesSection(props: SectionProps) {
  return <SectionScaffold anchor="new-uses" {...props} />;
}
