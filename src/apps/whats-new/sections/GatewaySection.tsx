import { SectionScaffold } from './SectionScaffold';
import type { SectionProps } from './types';

export function GatewaySection(props: SectionProps) {
  return <SectionScaffold anchor="gateway" {...props} />;
}
