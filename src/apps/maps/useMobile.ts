// Phone layout switch, in step with $breakpoint-mobile in src/shared/styles/_variables.scss (header, layout shell).
import { useSyncExternalStore } from 'react';

const QUERY = '(max-width: 700px)';

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/** True below the site's mobile breakpoint: the left bar becomes a bottom sheet. */
export function useMobile(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
