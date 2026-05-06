import type { ComparisonReport, ComparisonResult, DesignSnapshotPayload, PageSnapshotPayload } from "@d2p/shared";
import { buildComparisonReport } from "@d2p/shared";
import { getPool } from "../db";
import type { StoredTenant } from "./design-snapshots";

export interface StoredComparisonRun {
  id: number;
  tenantId: number;
  projectId: number;
  status: ComparisonResult["status"];
  tolerancePx: number;
  createdAt: string;
}

export interface ComparisonRunDetails extends StoredComparisonRun {
  figmaFileExternalId: string | null;
  figmaFileName: string | null;
  designSnapshot: DesignSnapshotPayload;
  pageSnapshot: PageSnapshotPayload;
  issues: ComparisonResult["issues"];
}

export interface ComparisonRunReport extends ComparisonReport {
  runId: number;
  createdAt: string;
  tolerancePx: number;
}

export async function insertComparisonRun(
  tenant: StoredTenant,
  projectId: number,
  designSnapshot: DesignSnapshotPayload,
  pageSnapshot: PageSnapshotPayload,
  comparison: ComparisonResult,
  tolerancePx: number
): Promise<StoredComparisonRun> {
  const pool = getPool();
  const result = await pool.query<{
    id: number;
    tenant_id: number;
    project_id: number;
    status: ComparisonResult["status"];
    tolerance_px: number;
    created_at: Date;
  }>(
    `
      INSERT INTO comparison_runs (
        tenant_id,
        project_id,
        design_snapshot,
        page_snapshot,
        status,
        issues,
        tolerance_px
      )
      VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6::jsonb, $7)
      RETURNING
        id,
        tenant_id,
        project_id,
        status,
        tolerance_px,
        created_at
    `,
    [
      tenant.id,
      projectId,
      JSON.stringify(designSnapshot),
      JSON.stringify(pageSnapshot),
      comparison.status,
      JSON.stringify(comparison.issues),
      tolerancePx,
    ]
  );

  const row = result.rows[0];

  return {
    id: row.id,
    tenantId: row.tenant_id,
    projectId: row.project_id,
    status: row.status,
    tolerancePx: row.tolerance_px,
    createdAt: row.created_at.toISOString(),
  };
}

export async function getComparisonRunById(
  tenantId: number,
  runId: number
): Promise<ComparisonRunDetails | null> {
  const pool = getPool();
  const result = await pool.query<{
    id: number;
    tenant_id: number;
    project_id: number;
    figma_file_external_id: string | null;
    figma_file_name: string | null;
    design_snapshot: DesignSnapshotPayload;
    page_snapshot: PageSnapshotPayload;
    status: ComparisonResult["status"];
    issues: ComparisonResult["issues"];
    tolerance_px: number;
    created_at: Date;
  }>(
    `
      SELECT
        cr.id,
        cr.tenant_id,
        cr.project_id,
        cr.design_snapshot,
        cr.page_snapshot,
        cr.status,
        cr.issues,
        cr.tolerance_px,
        cr.created_at,
        ff.external_id AS figma_file_external_id,
        ff.name AS figma_file_name
      FROM comparison_runs cr
      LEFT JOIN figma_files ff
        ON ff.project_id = cr.project_id
       AND ff.external_id = (cr.design_snapshot ->> 'figmaFileId')
      WHERE cr.tenant_id = $1
        AND cr.id = $2
      LIMIT 1
    `,
    [tenantId, runId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];

  return {
    id: row.id,
    tenantId: row.tenant_id,
    projectId: row.project_id,
    figmaFileExternalId: row.figma_file_external_id,
    figmaFileName: row.figma_file_name,
    status: row.status,
    tolerancePx: row.tolerance_px,
    createdAt: row.created_at.toISOString(),
    designSnapshot: row.design_snapshot,
    pageSnapshot: row.page_snapshot,
    issues: row.issues,
  };
}

export async function getComparisonRunReportById(
  tenantId: number,
  runId: number
): Promise<ComparisonRunReport | null> {
  const run = await getComparisonRunById(tenantId, runId);

  if (!run) {
    return null;
  }

  return {
    runId: run.id,
    createdAt: run.createdAt,
    tolerancePx: run.tolerancePx,
    ...buildComparisonReport(
      run.designSnapshot.tenantId,
      run.designSnapshot.projectId,
      run.designSnapshot.figmaFileId,
      run.issues,
      run.tolerancePx,
      run.designSnapshot,
      run.pageSnapshot
    ),
  };
}

