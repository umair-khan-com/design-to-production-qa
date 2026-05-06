import { getPool } from "../db";

export interface ComparisonIssueStatusRecord {
  id: number;
  tenantId: number;
  comparisonRunId: number;
  issueCode: string;
  issuePath: string;
  issueSeverity: "minor" | "major" | "critical";
  status: "open" | "resolved" | "ignored";
  note: string;
  resolvedByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export async function listComparisonIssueStatuses(
  tenantId: number,
  comparisonRunId: number
): Promise<ComparisonIssueStatusRecord[]> {
  const pool = getPool();
  const result = await pool.query<{
    id: number;
    tenant_id: number;
    comparison_run_id: number;
    issue_code: string;
    issue_path: string;
    issue_severity: "minor" | "major" | "critical";
    status: "open" | "resolved" | "ignored";
    note: string;
    resolved_by_user_id: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `
      SELECT
        id,
        tenant_id,
        comparison_run_id,
        issue_code,
        issue_path,
        issue_severity,
        status,
        note,
        resolved_by_user_id,
        created_at,
        updated_at
      FROM comparison_issue_status
      WHERE tenant_id = $1
        AND comparison_run_id = $2
      ORDER BY updated_at DESC, created_at DESC, id DESC
    `,
    [tenantId, comparisonRunId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    comparisonRunId: row.comparison_run_id,
    issueCode: row.issue_code,
    issuePath: row.issue_path,
    issueSeverity: row.issue_severity,
    status: row.status,
    note: row.note,
    resolvedByUserId: row.resolved_by_user_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));
}

export async function upsertComparisonIssueStatus(input: {
  tenantId: number;
  comparisonRunId: number;
  issueCode: string;
  issuePath: string;
  issueSeverity: "minor" | "major" | "critical";
  status: "open" | "resolved" | "ignored";
  note?: string;
  resolvedByUserId: string;
}): Promise<ComparisonIssueStatusRecord> {
  const pool = getPool();
  const result = await pool.query<{
    id: number;
    tenant_id: number;
    comparison_run_id: number;
    issue_code: string;
    issue_path: string;
    issue_severity: "minor" | "major" | "critical";
    status: "open" | "resolved" | "ignored";
    note: string;
    resolved_by_user_id: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `
      INSERT INTO comparison_issue_status (
        tenant_id,
        comparison_run_id,
        issue_code,
        issue_path,
        issue_severity,
        status,
        note,
        resolved_by_user_id,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (tenant_id, comparison_run_id, issue_code, issue_path)
      DO UPDATE SET
        issue_severity = EXCLUDED.issue_severity,
        status = EXCLUDED.status,
        note = EXCLUDED.note,
        resolved_by_user_id = EXCLUDED.resolved_by_user_id,
        updated_at = NOW()
      RETURNING
        id,
        tenant_id,
        comparison_run_id,
        issue_code,
        issue_path,
        issue_severity,
        status,
        note,
        resolved_by_user_id,
        created_at,
        updated_at
    `,
    [
      input.tenantId,
      input.comparisonRunId,
      input.issueCode,
      input.issuePath,
      input.issueSeverity,
      input.status,
      input.note ?? "",
      input.resolvedByUserId,
    ]
  );

  const row = result.rows[0];

  return {
    id: row.id,
    tenantId: row.tenant_id,
    comparisonRunId: row.comparison_run_id,
    issueCode: row.issue_code,
    issuePath: row.issue_path,
    issueSeverity: row.issue_severity,
    status: row.status,
    note: row.note,
    resolvedByUserId: row.resolved_by_user_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

