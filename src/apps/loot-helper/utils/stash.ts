export function getActiveStashItems(
  stashItemIds: Set<string>,
  disabledStashItemIds: Set<string>
): Set<string> {
  return new Set(Array.from(stashItemIds).filter((id) => !disabledStashItemIds.has(id)));
}