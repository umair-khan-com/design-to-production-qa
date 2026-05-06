import { getPool } from "../db";

export interface SessionFigmaFile {
  id: number;
  externalId: string;
  name: string | null;
}

export interface SessionProject {
  id: number;
  externalId: string;
  name: string | null;
  figmaFiles: SessionFigmaFile[];
}

export interface SessionContext {
  tenantId: string;
  userId: string;
  projects: SessionProject[];
}

export async function getSessionContext(
  userExternalId: string,
  tenantExternalId: string
): Promise<SessionContext | null> {
  const pool = getPool();

  const userResult = await pool.query<{ user_id: number }>(
    `
      SELECT u.id AS user_id
      FROM users u
      JOIN tenant_memberships tm ON tm.user_id = u.id
      JOIN tenants t ON t.id = tm.tenant_id
      WHERE u.external_id = $1
        AND t.external_id = $2
      LIMIT 1
    `,
    [userExternalId, tenantExternalId]
  );

  if (userResult.rowCount === 0) {
    return null;
  }

  const projectsResult = await pool.query<{
    project_id: number;
    project_external_id: string;
    project_name: string | null;
    file_id: number;
    file_external_id: string;
    file_name: string | null;
  }>(
    `
      SELECT
        p.id AS project_id,
        p.external_id AS project_external_id,
        p.name AS project_name,
        f.id AS file_id,
        f.external_id AS file_external_id,
        f.name AS file_name
      FROM projects p
      JOIN tenants t ON t.id = p.tenant_id
      LEFT JOIN figma_files f ON f.project_id = p.id
      WHERE t.external_id = $1
      ORDER BY p.id, f.id
    `,
    [tenantExternalId]
  );

  const projectMap = new Map<number, SessionProject>();

  for (const row of projectsResult.rows) {
    let project = projectMap.get(row.project_id);

    if (!project) {
      project = {
        id: row.project_id,
        externalId: row.project_external_id,
        name: row.project_name,
        figmaFiles: [],
      };
      projectMap.set(row.project_id, project);
    }

    if (row.file_id) {
      project.figmaFiles.push({
        id: row.file_id,
        externalId: row.file_external_id,
        name: row.file_name,
      });
    }
  }

  return {
    tenantId: tenantExternalId,
    userId: userExternalId,
    projects: [...projectMap.values()],
  };
}

