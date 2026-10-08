export type SupabaseLocalSignOut = (options: {
  scope: "local";
}) => Promise<{ error: unknown | null }>;

export async function signOutCurrentSession(
  signOut: SupabaseLocalSignOut,
): Promise<void> {
  const { error } = await signOut({ scope: "local" });

  if (error) {
    throw new Error("Sign out failed. Please try again.");
  }
}
