# Authentication and Identity

## Identity flow

Supabase Auth is UniMate's initial identity provider. Its user is not the UniMate
`User`: the verified Supabase access-token `sub` is stored as the opaque
`AuthIdentity.providerSubject`, unique with provider `SUPABASE`, and linked to
one UniMate `User`. A request to `/v1/auth/me` lazily provisions that mapping
on first use. User creation and identity insertion share one PostgreSQL
transaction; the database unique constraint arbitrates concurrent first
requests, and a losing transaction reads the committed identity after rollback.

`/v1/auth/me` returns only `{ user: { id }, universityAffiliations: [{ universityId }] }`.
Provider email, metadata, tokens, and `providerSubject` are not application
identity fields and are not copied into `User`. Authentication does not imply
university affiliation or authorisation for a product action.

## API verification and access posture

The API verifies Supabase JWT signatures locally through a cached remote JWKS,
with the issuer derived from `SUPABASE_URL` and audience from
`SUPABASE_JWT_AUDIENCE` (default `authenticated`). The verifier accepts only
Supabase's supported asymmetric ES256 and RS256 signatures, and validates
signature, issuer, audience, expiry, not-before when present, and a non-empty
subject. The API does not call Supabase Auth for each request and does not need
a Supabase secret key, service-role key, or shared JWT signing secret.

Protected API operations are authenticated by default. `@Public()` is the
explicit exception for the public system-health operation. Phase 5 establishes
identity only; it does not implement RBAC, capabilities, or resource policies.

A locally verified access token can remain valid until its expiry even after a
provider session or refresh token is revoked. Immediate access-token
revocation is not implemented; token lifetime is not extended to avoid refresh.

## Mobile session lifecycle

The mobile Supabase client is Auth-only and lives under
`apps/mobile/src/lib/auth/`. The provider restores the session, observes
`onAuthStateChange`, enables normal Supabase token refresh, and starts/stops
refresh with native app foreground state. The API transport reads the current
session token at request time, so token refreshes are used without token props
or token-bearing query keys.

On iOS and Android, the complete Supabase session is stored with the existing
`expo-secure-store` Keychain/Keystore capability. Because a real local session
serialized to 2,083 bytes and Expo documents historical per-value platform
limits around 2,048 bytes, the adapter splits values into bounded SecureStore
entries and switches generations only after all chunks have been written. It
does not move token material into AsyncStorage or invent encryption. On web,
Supabase uses browser `localStorage`; this is persistent browser storage, not
native encrypted storage, and has weaker security properties.

The auth provider owns provider session state. TanStack Query owns `/v1/auth/me`
and removes private identity data when the provider user changes or signs out.
Sign-out ends the provider session; it does not delete the UniMate User or
AuthIdentity.

## Configuration and local testing

`EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are public client configuration. Only a
`sb_publishable_` key is accepted in Expo. Never place a secret key,
service-role key, JWT signing secret, or database credential in an Expo
environment variable.

For local development, start the local stack with `pnpm db:start`, apply/check
Prisma migrations with `pnpm db:check`, configure `apps/api/.env` and
`apps/mobile/.env` from their examples, then run the API and Expo app. Android
emulator defaults use `10.0.2.2` for both the API and Supabase gateway;
iOS Simulator and web use loopback. Physical devices require reachable URL
overrides.

`pnpm auth:test` is the explicit real local integration workflow. It requires
local PostgreSQL and Supabase plus `DATABASE_URL` and `DIRECT_URL` from
`packages/database/.env`; the harness verifies both target the same loopback
database, then reads the local
`sb_publishable_` and `sb_secret_` values from `supabase status` in memory and
passes the latter only as `SUPABASE_TEST_SECRET_KEY` to the integration-test
process. It creates unique synthetic Auth users, signs in through the public
password flow, exercises the real API/JWKS path and refresh flow, and deletes
the provider users and corresponding application rows in cleanup. Ordinary
unit tests do not require Supabase.

## Deferred

Password recovery, social sign-in, account linking, MFA, passkeys, account
deletion synchronization, university verification/affiliation journeys, and
application authorisation belong to later phases.

## References

- [Supabase JWTs](https://supabase.com/docs/guides/auth/jwts)
- [Supabase JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys)
- [Supabase React Native Auth quickstart](https://supabase.com/docs/guides/auth/quickstarts/react-native)
- [Expo SDK 57 SecureStore](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/)
