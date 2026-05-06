import { getPool } from "../db";

export interface ComparisonFeedbackRecord {
  id: number;
  tenantId: number;
  comparisonRunId: number;
  createdByUserId: string;
  rating: number;
  sentiment: "positive" | "neutral" | "negative";
  notes: string;
  tags: string[];
  createdAt: string;
}

export async function addComparisonFeedback(input: {
  tenantId: number;
  comparisonRunId: number;
  createdByUserId: string;
  rating: number;
  sentiment: "positive" | "neutral" | "negative";
  notes?: string;
  tags?: string[];
}): Promise<ComparisonFeedbackRecord> {
  const pool = getPool();
  const result = await pool.query<{
    id: number;
    tenant_id: number;
    comparison_run_id: number;
    created_by_user_id: string;
    rating: number;
    sentiment: "positive" | "neutral" | "negative";
    notes: string;
    tags: string[];
    created_at: Date;
  }>(
    `
      INSERT INTO comparison_feedback (
        tenant_id,
        comparison_run_id,
        created_by_user_id,
        rating,
        sentiment,
        notes,
        tags
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      RETURNING
        id,
        tenant_id,
        comparison_run_id,
        created_by_user_id,
        rating,
        sentiment,
        notes,
        tags,
        created_at
    `,
    [
      input.tenantId,
      input.comparisonRunId,
      input.createdByUserId,
      input.rating,
      input.sentiment,
      input.notes ?? "",
      JSON.stringify(input.tags ?? []),
    ]
  );

  const row = result.rows[0];

  return {
    id: row.id,
    tenantId: row.tenant_id,
    comparisonRunId: row.comparison_run_id,
    createdByUserId: row.created_by_user_id,
    rating: row.rating,
    sentiment: row.sentiment,
    notes: row.notes,
    tags: row.tags ?? [],
    createdAt: row.created_at.toISOString(),
  };
}

export async function listComparisonFeedback(
  tenantId: number,
  comparisonRunId: number
): Promise<ComparisonFeedbackRecord[]> {
  const pool = getPool();
  const result = await pool.query<{
    id: number;
    tenant_id: number;
    comparison_run_id: number;
    created_by_user_id: string;
    rating: number;
    sentiment: "positive" | "neutral" | "negative";
    notes: string;
    tags: string[];
    created_at: Date;
  }>(
    `
      SELECT
        id,
        tenant_id,
        comparison_run_id,
        created_by_user_id,
        rating,
        sentiment,
        notes,
        tags,
        created_at
      FROM comparison_feedback
      WHERE tenant_id = $1
        AND comparison_run_id = $2
      ORDER BY created_at DESC, id DESC
    `,
    [tenantId, comparisonRunId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    comparisonRunId: row.comparison_run_id,
    createdByUserId: row.created_by_user_id,
    rating: row.rating,
    sentiment: row.sentiment,
    notes: row.notes,
    tags: row.tags ?? [],
    createdAt: row.created_at.toISOString(),
  }));
}

