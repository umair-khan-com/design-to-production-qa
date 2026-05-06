import { getPool } from "../db";

export async function upsertUser(externalId: string): Promise<{ id: number; externalId: string }> {
  const pool = getPool();
  const result = await pool.query<{
    id: number;
    external_id: string;
  }>(
    `
      INSERT INTO users (external_id)
      VALUES ($1)
      ON CONFLICT (external_id)
      DO UPDATE SET external_id = EXCLUDED.external_id
      RETURNING id, external_id
    `,
    [externalId]
  );

  return {
    id: result.rows[0].id,
    externalId: result.rows[0].external_id,
  };
}

export async function upsertTenant(externalId: string): Promise<{ id: number; externalId: string }> {
  const pool = getPool();
  const result = await pool.query<{
    id: number;
    external_id: string;
  }>(
    `
      INSERT INTO tenants (external_id)
      VALUES ($1)
      ON CONFLICT (external_id)
      DO UPDATE SET external_id = EXCLUDED.external_id
      RETURNING id, external_id
    `,
    [externalId]
  );

  return {
    id: result.rows[0].id,
    externalId: result.rows[0].external_id,
  };
}

export async function upsertMembership(
  tenantId: number,
  userId: number,
  role: string
): Promise<{ tenantId: number; userId: number; role: string }> {
  const pool = getPool();
  const result = await pool.query<{
    tenant_id: number;
    user_id: number;
    role: string;
  }>(
    `
      INSERT INTO tenant_memberships (tenant_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (tenant_id, user_id)
      DO UPDATE SET role = EXCLUDED.role
      RETURNING tenant_id, user_id, role
    `,
    [tenantId, userId, role]
  );

  return {
    tenantId: result.rows[0].tenant_id,
    userId: result.rows[0].user_id,
    role: result.rows[0].role,
  };
}

