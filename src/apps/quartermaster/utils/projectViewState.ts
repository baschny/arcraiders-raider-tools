export function normalizeCollapsedProjectIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value.filter((projectId): projectId is string =>
      typeof projectId === 'string' && projectId.length > 0),
  )];
}

export function setProjectCollapsed(
  collapsedProjectIds: unknown,
  projectId: string,
  isCollapsed: boolean,
): string[] {
  const next = new Set(normalizeCollapsedProjectIds(collapsedProjectIds));
  if (isCollapsed) {
    next.add(projectId);
  } else {
    next.delete(projectId);
  }
  return [...next];
}

export function setVisibleProjectsCollapsed(
  collapsedProjectIds: unknown,
  visibleProjectIds: string[],
  isCollapsed: boolean,
): string[] {
  const next = new Set(normalizeCollapsedProjectIds(collapsedProjectIds));
  for (const projectId of visibleProjectIds) {
    if (isCollapsed) {
      next.add(projectId);
    } else {
      next.delete(projectId);
    }
  }
  return [...next];
}
