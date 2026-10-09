export function shouldShowFoundationPushProof(
  development: boolean,
  hasAuthenticatedIdentity: boolean,
): boolean {
  return development && hasAuthenticatedIdentity;
}
