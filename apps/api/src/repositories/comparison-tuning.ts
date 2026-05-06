import { getPool } from "../db";

export interface TenantComparisonTuning {
  tenantId: number;
  feedbackCount: number;
  averageRating: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  tagCounts: Array<{ tag: string; count: number }>;
  recommendedTolerancePx: number;
  rationale: string;
}

function normalizeTolerance(value: number): number {
  return Math.max(3, Math.min(12, Math.round(value)));
}

export async function getTenantComparisonTuning(tenantId: number): Promise<TenantComparisonTuning> {
  const pool = getPool();

  const feedbackResult = await pool.query<{
    feedback_count: string;
    average_rating: string | null;
    positive_count: string;
    neutral_count: string;
    negative_count: string;
  }>(
    `
      SELECT
        COUNT(*)::text AS feedback_count,
        AVG(rating)::text AS average_rating,
        COUNT(*) FILTER (WHERE sentiment = 'positive')::text AS positive_count,
        COUNT(*) FILTER (WHERE sentiment = 'neutral')::text AS neutral_count,
        COUNT(*) FILTER (WHERE sentiment = 'negative')::text AS negative_count
      FROM comparison_feedback
      WHERE tenant_id = $1
    `,
    [tenantId]
  );

  const tagResult = await pool.query<{
    tag: string;
    count: string;
  }>(
    `
      SELECT
        tag.value AS tag,
        COUNT(*)::text AS count
      FROM comparison_feedback cf
      CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(cf.tags, '[]'::jsonb)) AS tag(value)
      WHERE cf.tenant_id = $1
      GROUP BY tag.value
      ORDER BY COUNT(*) DESC, tag.value ASC
      LIMIT 5
    `,
    [tenantId]
  );

  const feedbackCount = Number(feedbackResult.rows[0]?.feedback_count ?? 0);
  const averageRating = Number(feedbackResult.rows[0]?.average_rating ?? 0);
  const positiveCount = Number(feedbackResult.rows[0]?.positive_count ?? 0);
  const neutralCount = Number(feedbackResult.rows[0]?.neutral_count ?? 0);
  const negativeCount = Number(feedbackResult.rows[0]?.negative_count ?? 0);

  let tolerance = 5;
  const rationaleParts: string[] = [];

  if (feedbackCount > 0) {
    if (averageRating < 3.25) {
      tolerance += 2;
      rationaleParts.push("low beta ratings");
    } else if (averageRating < 4) {
      tolerance += 1;
      rationaleParts.push("mixed beta ratings");
    } else if (averageRating >= 4.5 && positiveCount >= negativeCount) {
      tolerance -= 1;
      rationaleParts.push("strong positive feedback");
    }

    const tags = tagResult.rows.map((row) => ({ tag: row.tag, count: Number(row.count) }));
    const tuningTags = new Set(tags.map((entry) => entry.tag.toLowerCase()));

    if (["spacing", "layout", "alignment", "size", "position"].some((tag) => tuningTags.has(tag))) {
      tolerance += 1;
      rationaleParts.push("spacing/layout feedback");
    }
    if (["copy", "text", "typography"].some((tag) => tuningTags.has(tag))) {
      tolerance += 1;
      rationaleParts.push("text feedback");
    }

    return {
      tenantId,
      feedbackCount,
      averageRating: Number(averageRating.toFixed(2)),
      positiveCount,
      neutralCount,
      negativeCount,
      tagCounts: tags,
      recommendedTolerancePx: normalizeTolerance(tolerance),
      rationale: rationaleParts.length ? rationaleParts.join(", ") : "baseline tolerance",
    };
  }

  return {
    tenantId,
    feedbackCount: 0,
    averageRating: 0,
    positiveCount: 0,
    neutralCount: 0,
    negativeCount: 0,
    tagCounts: [],
    recommendedTolerancePx: tolerance,
    rationale: "no beta feedback yet",
  };
}

