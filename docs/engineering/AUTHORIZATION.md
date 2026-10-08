# Authorisation

## Identity and permission are separate

Authentication establishes a verified `AuthenticatedPrincipal`. The API then
resolves its existing `(provider, providerSubject)` `AuthIdentity` to a UniMate
`User` before evaluating grants. An absent identity denies access; authorisation
never provisions a user. University affiliation is not an authorisation grant.

## Capabilities, roles, and assignments

The code-defined capability catalogue lives in
[`@unimate/authorization`](../../packages/authorization/). A capability is an
exact, stable action key with one declared scope kind. The current catalogue is:

| Capability                        | Scope        |
| --------------------------------- | ------------ |
| `platform.authorization.manage`   | `PLATFORM`   |
| `university.authorization.manage` | `UNIVERSITY` |

Unknown keys, prefixes, and wildcards have no meaning and never grant access.
Add a capability alongside the code that implements its action, its scope
definition, and focused tests.

`Role` and `RoleCapability` rows are mutable administration data. A Role is a
bundle of exact catalogue keys; its key and display name are never security
inputs. A `RoleAssignment` grants a Role to a User, while a
`CapabilityAssignment` supports an exceptional direct grant without creating a
one-capability Role. Grants are additive and the default is deny.

The only persisted scopes are `PLATFORM` and `UNIVERSITY`. University-scoped
assignments reference a real `University` row. A grant matches only its exact
scope: platform grants do not flow down to universities, and a grant for one
University does not apply to another. Future product scopes must be added with
their real relational resource and foreign key, not an arbitrary polymorphic
scope ID.

## API enforcement

Every API operation declares an access posture: public, authenticated, or
capability-authorised. The global `AuthenticationGuard` remains responsible for
identity and runs before the route-scoped `AuthorizationGuard` installed by
`@RequireCapability(...)`. A method-level posture overrides its controller-level
posture; each declaration level may declare only one posture.

- Missing or invalid authentication returns `401`.
- A verified principal without the required exact grant returns `403`.
- An authorisation infrastructure failure returns a generic `500`; implementation
  details are not sent to the client.

`AuthorizationService` checks PostgreSQL on each decision. It accepts a direct
grant or a matching Role assignment plus Role mapping. Catalogue scope,
assignment scope, Role scope, and requested University must agree. No permission
state is copied into JWT claims, Supabase metadata, or a cache.

PostgreSQL enforces `RoleAssignment(roleId, scopeKind) → Role(id, scopeKind)`
with a composite foreign key. The service also filters by the Role scope at
runtime as defense in depth.

The Prisma-owned `app` schema is backend-only. Application authorisation is
enforced by the Nest/application layer, not by Supabase claims or PostgreSQL RLS.
No user, seed fixture, authenticated session, or affiliated University receives
privileges automatically. Platform access bootstrap must be an explicit later
operational action.

## Resource policies

A capability is coarse permission to attempt an action in a scope; it does not
prove that the actor may access every individual resource. The owning feature's
application service remains responsible for code-defined resource policies,
such as ownership, membership, or lifecycle conditions:

```text
AuthenticationGuard
→ coarse capability check where applicable
→ controller
→ application service
→ load resource
→ feature-local resource policy
→ read or mutation
```

No generic policy-rule database or ABAC language is part of this foundation.
Role-management endpoints and screens are deferred until their administration
journeys exist.
