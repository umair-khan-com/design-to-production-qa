# Architecture

## System Boundaries
- Figma plugin extracts design data.
- Fastify API receives authenticated payloads.
- PostgreSQL stores users, tenants, memberships, projects, figma files, and design snapshots.
- PostgreSQL also stores comparison runs for historical QA reporting.
- PostgreSQL also stores tenant billing metadata and API keys for programmatic integrations.
- PostgreSQL also stores webhook subscriptions and delivery history for integrations.
- The API exposes a tenant usage endpoint and a tenant tuning endpoint, and enforces plan-based quotas before writes.
- The API exposes a session-context endpoint so the plugin can populate tenant-scoped project and file selectors.
- The API exposes a live page snapshot endpoint backed by Playwright for rendered page extraction, with viewport and user-agent capture settings.
- The API exposes a comparison preview endpoint for comparing design and page snapshots.
- The API exposes a persisted comparison route for saving comparison history.
- The API exposes a programmatic comparison route authenticated by tenant API key.
- The API exposes tenant billing metadata plus checkout and portal actions, along with API key minting and revocation endpoints.
- The API exposes webhook subscription endpoints, revocation, and emits comparison-created webhooks.
- The API exposes announcement delivery and acknowledgement endpoints so release notes and maintenance messages can be consumed in-app.
- The API exposes a comparison history endpoint for dashboard listing and drill-down.
- The API exposes a comparison report endpoint for downloadable JSON reporting.
- The shared comparison engine matches child nodes by tag, text, and box proximity before applying layout checks.
- Dashboard reads comparison results and history, then filters and exports comparison runs client-side, including project and file drill-down, report downloads, CSV export, issue-group filtering, beta feedback capture, and issue resolution tracking.
- Dashboard reads tenant usage for quota visibility, tenant tuning for default tolerance guidance, and summary cards.
- Dashboard reads release notes and maintenance messages for final-release updates, and tenant admins can publish new release notes or maintenance banners.
- Comparison workers will be added in Phase 3.

## Data Flow
1. User authenticates.
2. Plugin extracts design node data.
3. Plugin sends JSON payload to API.
4. API validates and stores the payload.
5. Later, comparison services retrieve the design snapshot and built page data.
6. Dashboard renders issues and reports.

## Design Principles
- Version all payloads.
- Keep tenant data isolated.
- Make contracts explicit before adding implementation detail.
