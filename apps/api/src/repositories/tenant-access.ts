import crypto from "node:crypto";
import { getPool } from "../db";

export interface TenantBillingInfo {
  tenantId: number;
  externalId: string;
  planName: string;
  planStatus: string;
  trialEndsAt: string | null;
  billingProvider: string;
  billingCustomerId: string | null;
  apiKeyCount: number;
}

export interface TenantApiKeyRecord {
  id: number;
  tenantId: number;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: string[];
  createdAt: string;
  revokedAt: string | null;
}

export interface TenantApiKeySecret {
  prefix: string;
  secret: string;
  rawKey: string;
}

function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

export async function getTenantBillingInfo(tenantId: number): Promise<TenantBillingInfo | null> {
  const pool = getPool();
  const result = await pool.query<{
    tenant_id: number;
    external_id: string;
    plan_name: string;
    plan_status: string;
    trial_ends_at: Date | null;
    billing_provider: string;
    billing_customer_id: string | null;
    api_key_count: string;
  }>(
    `
      SELECT
        t.id AS tenant_id,
        t.external_id,
        t.plan_name,
        t.plan_status,
        t.trial_ends_at,
        t.billing_provider,
        t.billing_customer_id,
        COUNT(ak.id)::text AS api_key_count
      FROM tenants t
      LEFT JOIN tenant_api_keys ak ON ak.tenant_id = t.id AND ak.revoked_at IS NULL
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
    billingProvider: row.billing_provider,
    billingCustomerId: row.billing_customer_id,
    apiKeyCount: Number(row.api_key_count ?? 0),
  };
}

export async function findTenantById(tenantId: number): Promise<{ id: number; externalId: string } | null> {
  const pool = getPool();
  const result = await pool.query<{
    id: number;
    external_id: string;
  }>(
    `
      SELECT id, external_id
      FROM tenants
      WHERE id = $1
      LIMIT 1
    `,
    [tenantId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return {
    id: result.rows[0].id,
    externalId: result.rows[0].external_id,
  };
}

export async function createTenantApiKey(
  tenantId: number,
  name: string,
  scopes: string[] = ["comparisons:write"]
): Promise<TenantApiKeySecret & TenantApiKeyRecord> {
  const pool = getPool();
  const prefix = crypto.randomBytes(4).toString("hex");
  const secret = crypto.randomBytes(24).toString("hex");
  const rawKey = `d2p_${prefix}_${secret}`;
  const keyHash = hashApiKey(rawKey);

  const result = await pool.query<{
    id: number;
    tenant_id: number;
    name: string;
    key_prefix: string;
    key_hash: string;
    scopes: string[];
    created_at: Date;
    revoked_at: Date | null;
  }>(
    `
      INSERT INTO tenant_api_keys (
        tenant_id,
        name,
        key_prefix,
        key_hash,
        scopes
      )
      VALUES ($1, $2, $3, $4, $5::jsonb)
      RETURNING id, tenant_id, name, key_prefix, key_hash, scopes, created_at, revoked_at
    `,
    [tenantId, name, prefix, keyHash, JSON.stringify(scopes)]
  );

  const row = result.rows[0];

  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    keyPrefix: row.key_prefix,
    keyHash: row.key_hash,
    scopes: row.scopes,
    createdAt: row.created_at.toISOString(),
    revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
    prefix,
    secret,
    rawKey,
  };
}

export async function revokeTenantApiKey(tenantId: number, apiKeyId: number): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query(
    `
      UPDATE tenant_api_keys
      SET revoked_at = NOW()
      WHERE tenant_id = $1
        AND id = $2
        AND revoked_at IS NULL
    `,
    [tenantId, apiKeyId]
  );

  return result.rowCount > 0;
}

export async function listTenantApiKeys(tenantId: number): Promise<TenantApiKeyRecord[]> {
  const pool = getPool();
  const result = await pool.query<{
    id: number;
    tenant_id: number;
    name: string;
    key_prefix: string;
    key_hash: string;
    scopes: string[];
    created_at: Date;
    revoked_at: Date | null;
  }>(
    `
      SELECT id, tenant_id, name, key_prefix, key_hash, scopes, created_at, revoked_at
      FROM tenant_api_keys
      WHERE tenant_id = $1
      ORDER BY created_at DESC, id DESC
    `,
    [tenantId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    keyPrefix: row.key_prefix,
    keyHash: row.key_hash,
    scopes: row.scopes,
    createdAt: row.created_at.toISOString(),
    revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
  }));
}

export async function resolveTenantApiKey(rawKey: string): Promise<TenantApiKeyRecord | null> {
  const pool = getPool();
  const keyHash = hashApiKey(rawKey);
  const result = await pool.query<{
    id: number;
    tenant_id: number;
    name: string;
    key_prefix: string;
    key_hash: string;
    scopes: string[];
    created_at: Date;
    revoked_at: Date | null;
  }>(
    `
      SELECT id, tenant_id, name, key_prefix, key_hash, scopes, created_at, revoked_at
      FROM tenant_api_keys
      WHERE key_hash = $1
        AND revoked_at IS NULL
      LIMIT 1
    `,
    [keyHash]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];

  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    keyPrefix: row.key_prefix,
    keyHash: row.key_hash,
    scopes: row.scopes,
    createdAt: row.created_at.toISOString(),
    revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
  };
}

