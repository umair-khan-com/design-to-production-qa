import { getPool } from "../db";

export interface ComparisonHistoryItem {
  id: number;
  tenantId: number;
  projectId: number;
  figmaFileExternalId: string | null;
  figmaFileName: string | null;
  status: string;
  tolerancePx: number;
  createdAt: string;
}

export async function listComparisonHistory(
  tenantId: number,
  projectId?: number,
  figmaFileExternalId?: string,
  limit = 20
): Promise<ComparisonHistoryItem[]> {
  const pool = getPool();

  const result = await pool.query<{
    id: number;
    tenant_id: number;
    project_id: number;
    figma_file_external_id: string | null;
    figma_file_name: string | null;
    status: string;
    tolerance_px: number;
    created_at: Date;
  }>(
    `
      SELECT
        cr.id,
        cr.tenant_id,
        cr.project_id,
        cr.status,
        cr.tolerance_px,
        cr.created_at,
        ff.external_id AS figma_file_external_id,
        ff.name AS figma_file_name
      FROM comparison_runs cr
      LEFT JOIN figma_files ff
        ON ff.project_id = cr.project_id
       AND ff.external_id = (cr.design_snapshot ->> 'figmaFileId')
      WHERE cr.tenant_id = $1
        AND ($2::bigint IS NULL OR cr.project_id = $2::bigint)
        AND ($3::text IS NULL OR ff.external_id = $3::text)
      ORDER BY cr.created_at DESC, cr.id DESC
      LIMIT $4
    `,
    [tenantId, projectId ?? null, figmaFileExternalId ?? null, limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    projectId: row.project_id,
    figmaFileExternalId: row.figma_file_external_id,
    figmaFileName: row.figma_file_name,
    status: row.status,
    tolerancePx: row.tolerance_px,
    createdAt: row.created_at.toISOString(),
  }));
}

