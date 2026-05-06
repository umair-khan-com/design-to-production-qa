import type { DesignSnapshotPayload } from "@d2p/shared";
import { getPool } from "../db";

export interface StoredTenant {
  id: number;
  externalId: string;
}

export interface StoredProject {
  id: number;
  tenantId: number;
  externalId: string;
  name: string | null;
}

export interface StoredFigmaFile {
  id: number;
  projectId: number;
  externalId: string;
  name: string | null;
}

export interface StoredDesignSnapshot {
  id: number;
  tenantId: number;
  projectId: number;
  figmaFileId: number;
  schemaVersion: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

async function upsertTenant(externalId: string): Promise<StoredTenant> {
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

export async function findTenantByExternalId(externalId: string): Promise<StoredTenant | null> {
  const pool = getPool();
  const result = await pool.query<{
    id: number;
    external_id: string;
  }>(
    `
      SELECT id, external_id
      FROM tenants
      WHERE external_id = $1
      LIMIT 1
    `,
    [externalId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return {
    id: result.rows[0].id,
    externalId: result.rows[0].external_id,
  };
}

export async function upsertProject(tenantId: number, externalId: string): Promise<StoredProject> {
  const pool = getPool();
  const result = await pool.query<{
    id: number;
    tenant_id: number;
    external_id: string;
    name: string | null;
  }>(
    `
      INSERT INTO projects (tenant_id, external_id)
      VALUES ($1, $2)
      ON CONFLICT (tenant_id, external_id)
      DO UPDATE SET external_id = EXCLUDED.external_id
      RETURNING id, tenant_id, external_id, name
    `,
    [tenantId, externalId]
  );

  return {
    id: result.rows[0].id,
    tenantId: result.rows[0].tenant_id,
    externalId: result.rows[0].external_id,
    name: result.rows[0].name,
  };
}

export async function findProjectByExternalId(
  tenantId: number,
  externalId: string
): Promise<StoredProject | null> {
  const pool = getPool();
  const result = await pool.query<{
    id: number;
    tenant_id: number;
    external_id: string;
    name: string | null;
  }>(
    `
      SELECT id, tenant_id, external_id, name
      FROM projects
      WHERE tenant_id = $1
        AND external_id = $2
      LIMIT 1
    `,
    [tenantId, externalId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return {
    id: result.rows[0].id,
    tenantId: result.rows[0].tenant_id,
    externalId: result.rows[0].external_id,
    name: result.rows[0].name,
  };
}

export async function upsertFigmaFile(projectId: number, externalId: string): Promise<StoredFigmaFile> {
  const pool = getPool();
  const result = await pool.query<{
    id: number;
    project_id: number;
    external_id: string;
    name: string | null;
  }>(
    `
      INSERT INTO figma_files (project_id, external_id)
      VALUES ($1, $2)
      ON CONFLICT (project_id, external_id)
      DO UPDATE SET external_id = EXCLUDED.external_id
      RETURNING id, project_id, external_id, name
    `,
    [projectId, externalId]
  );

  return {
    id: result.rows[0].id,
    projectId: result.rows[0].project_id,
    externalId: result.rows[0].external_id,
    name: result.rows[0].name,
  };
}

export async function insertDesignSnapshot(
  payload: DesignSnapshotPayload
): Promise<StoredDesignSnapshot> {
  const pool = getPool();
  const tenant = await upsertTenant(payload.tenantId);
  const project = await upsertProject(tenant.id, payload.projectId);
  const figmaFile = await upsertFigmaFile(project.id, payload.figmaFileId);

  const result = await pool.query<{
    id: number;
    tenant_id: number;
    project_id: number;
    figma_file_id: number;
    schema_version: string;
    metadata: Record<string, unknown>;
    created_at: Date;
  }>(
    `
      INSERT INTO design_snapshots (
        tenant_id,
        project_id,
        figma_file_id,
        schema_version,
        nodes,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
      RETURNING
        id,
        tenant_id,
        project_id,
        figma_file_id,
        schema_version,
        metadata,
        created_at
    `,
    [
      tenant.id,
      project.id,
      figmaFile.id,
      payload.metadata.schemaVersion,
      JSON.stringify(payload.nodes),
      JSON.stringify(payload.metadata),
    ]
  );

  const row = result.rows[0];

  return {
    id: row.id,
    tenantId: row.tenant_id,
    projectId: row.project_id,
    figmaFileId: row.figma_file_id,
    schemaVersion: row.schema_version,
    metadata: row.metadata,
    createdAt: row.created_at.toISOString(),
  };
}

export async function getDatabaseSnapshotCount(): Promise<number> {
  const pool = getPool();
  const result = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM design_snapshots");
  return Number(result.rows[0]?.count ?? 0);
}

