import { SectionScaffold } from './SectionScaffold';
import type { SectionProps } from './types';

export function StencilsSection(props: SectionProps) {
  return <SectionScaffold anchor="stencils" {...props} />;
}
