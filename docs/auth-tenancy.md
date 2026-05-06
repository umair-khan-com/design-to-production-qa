# Auth and Tenancy

## Authentication
- Use JWT-backed authentication for the API.
- The active tenant comes from JWT claims, not from the request body.
- Keep the auth provider pluggable so Auth0, Firebase, or a custom issuer can be added later.

## Tenancy
- Tenant is the top-level ownership boundary.
- Users belong to one or more tenants.
- Projects belong to one tenant.
- Every design snapshot and comparison result must carry a tenant id.
- The API checks `tenant_memberships` before persisting snapshots.

## Roles
- admin
- editor
- reviewer

## Local Development
- Use `POST /v1/dev/bootstrap-token` with `DEV_BOOTSTRAP_SECRET` to mint a token for a user and tenant.
- Use the returned JWT as `Authorization: Bearer <token>` when calling protected routes.
- Use `GET /v1/session-context` to load the current tenant's accessible projects and figma files.
