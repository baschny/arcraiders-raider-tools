import { SectionScaffold } from './SectionScaffold';
import type { SectionProps } from './types';

export function ChangesSection(props: SectionProps) {
  return <SectionScaffold anchor="changes" {...props} />;
}
