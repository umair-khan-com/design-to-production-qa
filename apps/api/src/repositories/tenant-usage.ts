import { getPool } from "../db";

export interface TenantUsage {
  tenantId: number;
  externalId: string;
  planName: string;
  planStatus: string;
  trialEndsAt: string | null;
  snapshotCount: number;
  comparisonRunCount: number;
  apiKeyCount: number;
  webhookCount: number;
  activeWebhookCount: number;
  membershipCount: number;
}

export async function getTenantUsage(tenantId: number): Promise<TenantUsage | null> {
  const pool = getPool();
  const result = await pool.query<{
    tenant_id: number;
    external_id: string;
    plan_name: string;
    plan_status: string;
    trial_ends_at: Date | null;
    snapshot_count: string;
    comparison_run_count: string;
    api_key_count: string;
    webhook_count: string;
    active_webhook_count: string;
    membership_count: string;
  }>(
    `
      SELECT
        t.id AS tenant_id,
        t.external_id,
        t.plan_name,
        t.plan_status,
        t.trial_ends_at,
        COUNT(DISTINCT ds.id)::text AS snapshot_count,
        COUNT(DISTINCT cr.id)::text AS comparison_run_count,
        COUNT(DISTINCT ak.id)::text AS api_key_count,
        COUNT(DISTINCT tw.id)::text AS webhook_count,
        COUNT(DISTINCT tw_active.id)::text AS active_webhook_count,
        COUNT(DISTINCT tm.id)::text AS membership_count
      FROM tenants t
      LEFT JOIN design_snapshots ds ON ds.tenant_id = t.id
      LEFT JOIN comparison_runs cr ON cr.tenant_id = t.id
      LEFT JOIN tenant_api_keys ak ON ak.tenant_id = t.id AND ak.revoked_at IS NULL
      LEFT JOIN tenant_webhooks tw ON tw.tenant_id = t.id
      LEFT JOIN tenant_webhooks tw_active ON tw_active.tenant_id = t.id AND tw_active.revoked_at IS NULL
      LEFT JOIN tenant_memberships tm ON tm.tenant_id = t.id
      WHERE t.id = $1
      GROUP BY t.id
      LIMIT 1
    `,
    [tenantId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];

  return {
    tenantId: row.tenant_id,
    externalId: row.external_id,
    planName: row.plan_name,
    planStatus: row.plan_status,
    trialEndsAt: row.trial_ends_at ? row.trial_ends_at.toISOString() : null,
    snapshotCount: Number(row.snapshot_count ?? 0),
    comparisonRunCount: Number(row.comparison_run_count ?? 0),
    apiKeyCount: Number(row.api_key_count ?? 0),
    webhookCount: Number(row.webhook_count ?? 0),
    activeWebhookCount: Number(row.active_webhook_count ?? 0),
    membershipCount: Number(row.membership_count ?? 0),
  };
}

export interface TenantPlanLimits {
  maxSnapshots: number;
  maxComparisonRuns: number;
  maxApiKeys: number;
  maxWebhooks: number;
  maxMembers: number;
}

export function resolveTenantPlanLimits(planName: string): TenantPlanLimits {
  switch (planName) {
    case "pro":
      return {
        maxSnapshots: 5000,
        maxComparisonRuns: 10000,
        maxApiKeys: 25,
        maxWebhooks: 25,
        maxMembers: 25,
      };
    case "enterprise":
      return {
        maxSnapshots: Number.POSITIVE_INFINITY,
        maxComparisonRuns: Number.POSITIVE_INFINITY,
        maxApiKeys: Number.POSITIVE_INFINITY,
        maxWebhooks: Number.POSITIVE_INFINITY,
        maxMembers: Number.POSITIVE_INFINITY,
      };
    default:
      return {
        maxSnapshots: 250,
        maxComparisonRuns: 250,
        maxApiKeys: 3,
        maxWebhooks: 3,
        maxMembers: 5,
      };
  }
}

export function checkTenantUsageWithinLimits(usage: TenantUsage): { ok: boolean; reason?: string } {
  const limits = resolveTenantPlanLimits(usage.planName);

  if (usage.snapshotCount > limits.maxSnapshots) {
    return { ok: false, reason: "Snapshot quota exceeded" };
  }

  if (usage.comparisonRunCount > limits.maxComparisonRuns) {
    return { ok: false, reason: "Comparison quota exceeded" };
  }

  if (usage.apiKeyCount > limits.maxApiKeys) {
    return { ok: false, reason: "API key quota exceeded" };
  }

  if (usage.activeWebhookCount > limits.maxWebhooks) {
    return { ok: false, reason: "Webhook quota exceeded" };
  }

  if (usage.membershipCount > limits.maxMembers) {
    return { ok: false, reason: "Member quota exceeded" };
  }

  return { ok: true };
}

