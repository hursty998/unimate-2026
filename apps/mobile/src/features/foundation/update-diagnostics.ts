export type FoundationUpdateSource =
  "Published EAS Update" | "Embedded bundle" | "Metro or unclassified bundle";

export function getFoundationUpdateSource(
  updateId: string | null,
  isEmbeddedLaunch: boolean,
): FoundationUpdateSource {
  if (isEmbeddedLaunch) return "Embedded bundle";
  if (updateId) return "Published EAS Update";
  return "Metro or unclassified bundle";
}
