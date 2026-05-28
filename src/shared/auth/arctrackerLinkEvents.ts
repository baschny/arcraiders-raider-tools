export const ARCTRACKER_LINK_INVALID_EVENT = 'raider-tools:arctracker-link-invalid';

export function notifyArctrackerLinkInvalid(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ARCTRACKER_LINK_INVALID_EVENT));
}
