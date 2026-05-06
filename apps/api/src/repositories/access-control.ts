import { getPool } from "../db";

export async function userHasTenantAccess(userExternalId: string, tenantExternalId: string): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query<{ allowed: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM users u
        JOIN tenant_memberships tm ON tm.user_id = u.id
        JOIN tenants t ON t.id = tm.tenant_id
        WHERE u.external_id = $1
          AND t.external_id = $2
      ) AS allowed
    `,
    [userExternalId, tenantExternalId]
  );

  return Boolean(result.rows[0]?.allowed);
}

export async function getTenantMembershipRole(
  userExternalId: string,
  tenantExternalId: string
): Promise<string | null> {
  const pool = getPool();
  const result = await pool.query<{ role: string }>(
    `
      SELECT tm.role
      FROM users u
      JOIN tenant_memberships tm ON tm.user_id = u.id
      JOIN tenants t ON t.id = tm.tenant_id
      WHERE u.external_id = $1
        AND t.external_id = $2
      LIMIT 1
    `,
    [userExternalId, tenantExternalId]
  );

  return result.rows[0]?.role ?? null;
}

export async function userHasTenantRole(
  userExternalId: string,
  tenantExternalId: string,
  role: string
): Promise<boolean> {
  const actualRole = await getTenantMembershipRole(userExternalId, tenantExternalId);
  return actualRole === role;
}

