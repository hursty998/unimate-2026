# Authentication Package Guidance

- This package is server-side provider infrastructure. Keep it independent of
  NestJS, Prisma/database packages, Supabase JS, Expo/React Native, and UniMate
  feature code.
- Verify access tokens locally with `jose` and asymmetric JWKS keys. Never add a
  shared Supabase JWT secret, service-role credential, provider metadata, or
  user-profile fields to the verified identity.
- Keep the public package API small: verified identity and token-verifier
  contracts plus the Supabase adapter.
- Keep verifier tests deterministic and independent of Supabase.
- API access posture and application identity provisioning belong in
  `apps/api`, not this package.
