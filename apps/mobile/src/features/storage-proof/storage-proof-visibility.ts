export function shouldShowStorageProof(
  development: boolean,
  hasAuthenticatedIdentity: boolean,
): boolean {
  return development && hasAuthenticatedIdentity;
}
