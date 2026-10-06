// Radio groups of buttons (map, condition, mode and map layer switches).
import type { KeyboardEvent } from 'react';

const RADIO_STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * Keyboard handler for a `role="radiogroup"` of buttons (WAI-ARIA radio group): arrow keys, Home and End move to the
 * next radio and select it. The checked radio is the only one in the tab order (`radioTab`).
 */
export function radioKeys(e: KeyboardEvent<HTMLElement>) {
  const step = RADIO_STEP[e.key];
  if (step == null && e.key !== 'Home' && e.key !== 'End') return;
  const radios = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)')];
  if (!radios.length) return;
  const at = radios.indexOf(document.activeElement as HTMLButtonElement);
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? radios.length - 1 : (Math.max(0, at) + step + radios.length) % radios.length;
  e.preventDefault();
  radios[next].focus();
  if (radios[next].getAttribute('aria-checked') !== 'true') radios[next].click();
}

/** Props of a radio button in a `radioKeys` group. */
export const radioTab = (checked: boolean) => ({ role: 'radio', 'aria-checked': checked, tabIndex: checked ? 0 : -1 }) as const;
