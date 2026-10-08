export function getLocalIconPath(iconUrl: string): string {
  if (!iconUrl) return '';
  const filename = iconUrl.split('/').pop();
  return `/images/events/${filename}`;
}
