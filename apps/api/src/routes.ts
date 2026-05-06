import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareDesignToPage, validateDesignSnapshot, validatePageSnapshot } from "@d2p/shared";
import type {
  ComparisonResult,
  DesignSnapshotPayload,
  PageCaptureSettings,
  PageSnapshotPayload,
  WebhookComparisonEventPayload,
} from "@d2p/shared";
import type { AuthClaims } from "./auth";
import { buildDesignSnapshotFromFigmaUrl, parseFigmaUrl } from "./figma";
import { createEmptyComparisonResult } from "./index";
import { createBillingCheckoutAction, createBillingPortalAction, resolveBillingProviderConfig } from "./billing-provider";
import { acknowledgeAnnouncement, listAnnouncementFeed, type AnnouncementFeedItem } from "./repositories/announcement-feed";
import { extractPageSnapshotFromUrl } from "./page-extraction";
import { userHasTenantAccess, userHasTenantRole } from "./repositories/access-control";
import {
  getDatabaseSnapshotCount,
  findProjectByExternalId,
  findTenantByExternalId,
  insertDesignSnapshot,
  upsertProject,
} from "./repositories/design-snapshots";
import {
  getComparisonRunById,
  getComparisonRunReportById,
  insertComparisonRun,
} from "./repositories/comparison-runs";
import { addComparisonFeedback, listComparisonFeedback } from "./repositories/comparison-feedback";
import { getTenantComparisonTuning } from "./repositories/comparison-tuning";
import {
  listComparisonIssueStatuses,
  upsertComparisonIssueStatus,
} from "./repositories/comparison-issue-status";
import {
  createReleaseNote,
  getLatestReleaseNote,
  getMaintenanceMessage,
  listReleaseNotes,
  setMaintenanceMessage,
} from "./repositories/release-notes";
import { listComparisonHistory } from "./repositories/comparison-history";
import { getSessionContext } from "./repositories/session-context";
import { upsertMembership, upsertTenant, upsertUser } from "./repositories/provisioning";
import {
  checkTenantUsageWithinLimits,
  getTenantUsage,
  resolveTenantPlanLimits,
} from "./repositories/tenant-usage";
import {
  createTenantApiKey,
  findTenantById,
  getTenantBillingInfo,
  resolveTenantApiKey,
  listTenantApiKeys,
  revokeTenantApiKey,
  type TenantApiKeyRecord,
} from "./repositories/tenant-access";
import {
  createTenantWebhook,
  deliverComparisonCreatedWebhooks,
  deliverComparisonFailedWebhooks,
  findTenantWebhookById,
  listTenantWebhookDeliveries,
  listTenantWebhooks,
  redeliverTenantWebhookDelivery,
  revokeTenantWebhook,
} from "./repositories/webhooks";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../..");

interface DevBootstrapBody {
  userId: string;
  tenantId: string;
  role?: string;
}

interface DevDemoSeedBody {
  tenantId?: string;
  userId?: string;
}

interface ComparisonPreviewBody {
  designSnapshot: DesignSnapshotPayload;
  pageSnapshot: PageSnapshotPayload;
  tolerancePx?: number;
}

interface ComparisonRunBody {
  tenantId: string;
  projectId: string;
  designSnapshot: DesignSnapshotPayload;
  pageSnapshot: PageSnapshotPayload;
  tolerancePx?: number;
}

type DevicePreset = "desktop" | "tablet" | "mobile";

interface QaCheckBody {
  tenantId: string;
  projectId: string;
  figmaUrl: string;
  pageUrl: string;
  viewport?: DevicePreset;
  tolerancePx?: number;
}

interface PageSnapshotExtractionBody {
  tenantId: string;
  projectId: string;
  pageUrl: string;
  schemaVersion?: string;
  capture?: PageCaptureSettings;
}

interface ComparisonHistoryQuery {
  projectId?: string;
  figmaFileId?: string;
  limit?: string;
}

interface ComparisonDetailParams {
  id: string;
}

interface ComparisonFeedbackBody {
  rating: number;
  sentiment: "positive" | "neutral" | "negative";
  notes?: string;
  tags?: string[];
}

interface ComparisonIssueStatusBody {
  issueCode: string;
  issuePath: string;
  issueSeverity: "minor" | "major" | "critical";
  status: "open" | "resolved" | "ignored";
  note?: string;
}

interface ApiKeyCreateBody {
  tenantId: string;
  name: string;
  scopes?: string[];
}

interface IntegrationComparisonBody extends ComparisonRunBody {}

interface TenantBillingParams {
  tenantId: string;
}

interface ReleaseManagementParams {
  tenantId: string;
}

interface ReleaseNoteBody {
  version: string;
  title: string;
  summary: string;
  highlights?: string[];
}

interface MaintenanceBody {
  message: string;
}

interface DevDemoSeedResponse {
  ok: true;
  token: string;
  tenantId: string;
  userId: string;
  projectId: string;
  figmaFileId: string;
  comparisonRunId: number;
  comparisonStatus: ComparisonResult["status"];
}

interface AnnouncementAckParams {
  id: string;
}

interface ApiKeyRevokeParams {
  id: string;
}

interface WebhookCreateBody {
  tenantId: string;
  name: string;
  targetUrl: string;
  events?: string[];
}

interface WebhookRevokeParams {
  id: string;
}

interface WebhookDeliveriesParams {
  id: string;
}

interface WebhookDeliveryRedeliverParams {
  id: string;
  deliveryId: string;
}

interface WebhookDeliveriesQuery {
  limit?: string;
}

interface TenantUsageParams {
  tenantId: string;
}

interface TenantTuningParams {
  tenantId: string;
}

interface AnnouncementFeedResponse {
  ok: true;
  unreadCount: number;
  announcements: AnnouncementFeedItem[];
}

interface AnnouncementAckResponse {
  ok: true;
  unreadCount: number;
  announcement: AnnouncementFeedItem;
}

function resolveDeviceCapture(preset: DevicePreset | undefined): Required<PageCaptureSettings> & { isMobile: boolean } {
  const defaultWidth = Number.parseInt(process.env.DEFAULT_WIDTH ?? "1440", 10) || 1440;
  const defaultHeight = Number.parseInt(process.env.DEFAULT_HEIGHT ?? "1024", 10) || 1024;
  const defaultPreset = (process.env.DEFAULT_VIEWPORT as DevicePreset | undefined) ?? "desktop";
  const resolvedPreset = preset ?? defaultPreset;

  if (resolvedPreset === "tablet") {
    return {
      viewportWidth: 768,
      viewportHeight: 1024,
      deviceScaleFactor: 1,
      userAgent:
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      isMobile: false,
    };
  }

  if (resolvedPreset === "mobile") {
    return {
      viewportWidth: 390,
      viewportHeight: 844,
      deviceScaleFactor: 3,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      isMobile: true,
    };
  }

  return {
    viewportWidth: defaultWidth,
    viewportHeight: defaultHeight,
    deviceScaleFactor: 1,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    isMobile: false,
  };
}

function resolveDefaultTolerance(): number {
  const parsed = Number.parseInt(process.env.DEFAULT_TOLERANCE ?? "20", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
}

const ALLOWED_API_KEY_SCOPES = new Set([
  "comparisons:read",
  "comparisons:write",
  "reports:read",
  "webhooks:write",
]);

interface AuthenticatedTenantAccess {
  tenantId: number;
  tenantExternalId: string;
  userId?: string;
  apiKey?: TenantApiKeyRecord;
}

function buildWebhookComparisonEvent(
  eventType: WebhookComparisonEventPayload["eventType"],
  tenantExternalId: string,
  comparison: ComparisonResult,
  storedComparison: {
    id: number;
    tenantId: number;
    projectId: number;
    status: ComparisonResult["status"];
    tolerancePx: number;
    createdAt: string;
  },
  designSnapshot: DesignSnapshotPayload,
  pageSnapshot: PageSnapshotPayload
): WebhookComparisonEventPayload {
  return {
    eventId: `evt_${storedComparison.id}_${eventType}_${Date.now()}`,
    eventType,
    occurredAt: new Date().toISOString(),
    tenantId: tenantExternalId,
    projectId: designSnapshot.projectId,
    figmaFileId: designSnapshot.figmaFileId,
    comparison,
    storedComparison,
    designSnapshot,
    pageSnapshot,
  };
}

async function resolveComparisonTolerance(
  tenantId: number,
  explicitTolerance?: number
): Promise<{ tolerancePx: number; source: "request" | "feedback" | "default" }> {
  if (typeof explicitTolerance === "number" && Number.isFinite(explicitTolerance)) {
    return {
      tolerancePx: explicitTolerance,
      source: "request",
    };
  }

  const tuning = await getTenantComparisonTuning(tenantId);

  if (tuning.feedbackCount > 0) {
    return {
      tolerancePx: tuning.recommendedTolerancePx,
      source: "feedback",
    };
  }

  return {
    tolerancePx: 5,
    source: "default",
  };
}

async function resolveTenantAdminAccess(request: FastifyRequest, reply: FastifyReply): Promise<AuthenticatedTenantAccess | null> {
  const access = await resolveJwtTenantAccess(request, reply);

  if (!access) {
    return null;
  }

  const isAdmin = await userHasTenantRole(access.userId ?? "", access.tenantExternalId, "admin");

  if (!isAdmin) {
    void reply.status(403).send({
      ok: false,
      message: "Tenant admin access required",
    });
    return null;
  }

  return access;
}

async function resolveJwtTenantAccess(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<AuthenticatedTenantAccess | null> {
  let auth: AuthClaims;

  try {
    auth = await request.jwtVerify<AuthClaims>();
  } catch {
    void reply.status(401).send({
      ok: false,
      message: "Unauthorized",
    });
    return null;
  }

  const allowed = await userHasTenantAccess(auth.sub, auth.tenantId);

  if (!allowed) {
    void reply.status(403).send({
      ok: false,
      message: "Tenant access denied",
    });
    return null;
  }

  const tenant = await findTenantByExternalId(auth.tenantId);

  if (!tenant) {
    void reply.status(404).send({
      ok: false,
      message: "Tenant not found",
    });
    return null;
  }

  return {
    tenantId: tenant.id,
    tenantExternalId: tenant.externalId,
    userId: auth.sub,
  };
}

async function resolveApiKeyTenantAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  requiredScopes: string[]
): Promise<AuthenticatedTenantAccess | null> {
  const rawKey = request.headers["x-api-key"];

  if (typeof rawKey !== "string" || !rawKey.trim()) {
    void reply.status(401).send({
      ok: false,
      message: "API key required",
    });
    return null;
  }

  const apiKey = await resolveTenantApiKey(rawKey.trim());

  if (!apiKey) {
    void reply.status(401).send({
      ok: false,
      message: "Invalid API key",
    });
    return null;
  }

  if (requiredScopes.some((scope) => !apiKey.scopes.includes(scope))) {
    void reply.status(403).send({
      ok: false,
      message: "API key does not have the required scope",
    });
    return null;
  }

  const tenant = await findTenantById(apiKey.tenantId);

  if (!tenant) {
    void reply.status(404).send({
      ok: false,
      message: "Tenant not found",
    });
    return null;
  }

  return {
    tenantId: tenant.id,
    tenantExternalId: tenant.externalId,
    apiKey,
  };
}

async function resolveTenantReadAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  requiredScopes: string[]
): Promise<AuthenticatedTenantAccess | null> {
  if (typeof request.headers["x-api-key"] === "string" && request.headers["x-api-key"].trim()) {
    return resolveApiKeyTenantAccess(request, reply, requiredScopes);
  }

  return resolveJwtTenantAccess(request, reply);
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => {
    return {
      ok: true,
      service: "api",
    };
  });

  app.get("/health/db", async () => {
    try {
      const count = await getDatabaseSnapshotCount();
      return {
        ok: true,
        snapshots: count,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Database not available",
      };
    }
  });

  app.post<{ Body: DevBootstrapBody }>("/v1/dev/bootstrap-token", async (request, reply) => {
    const expectedSecret = process.env.DEV_BOOTSTRAP_SECRET;

    if (!expectedSecret || request.headers["x-dev-bootstrap-secret"] !== expectedSecret) {
      return reply.status(401).send({
        ok: false,
        message: "Unauthorized",
      });
    }

    const user = await upsertUser(request.body.userId);
    const tenant = await upsertTenant(request.body.tenantId);
    const membership = await upsertMembership(tenant.id, user.id, request.body.role ?? "admin");
    const token = await reply.jwtSign({
      sub: request.body.userId,
      tenantId: request.body.tenantId,
      roles: [membership.role],
    } satisfies AuthClaims);

    return {
      ok: true,
      token,
      user,
      tenant,
      membership,
    };
  });

  app.post<{ Body: DevDemoSeedBody }>("/v1/dev/demo-seed", async (request, reply) => {
    const expectedSecret = process.env.DEV_BOOTSTRAP_SECRET;

    const providedSecret = request.headers["x-dev-bootstrap-secret"];
    const isLocalDev = process.env.NODE_ENV !== "production";

    if (!isLocalDev && (!expectedSecret || providedSecret !== expectedSecret)) {
      return reply.status(401).send({
        ok: false,
        message: "Unauthorized",
      });
    }

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const tenantId = request.body.tenantId?.trim() || `demo_figma_${uniqueSuffix}`;
    const userId = request.body.userId?.trim() || `demo_user_${uniqueSuffix}`;
    const designSnapshotPath = path.join(rootDir, "plugins", "figma", "fixtures", "sample-snapshot.json");
    const pageSnapshotPath = path.join(rootDir, "packages", "shared", "fixtures", "sample-page-snapshot.json");
    const designSnapshot = JSON.parse(await fs.readFile(designSnapshotPath, "utf8")) as DesignSnapshotPayload;
    const pageSnapshot = JSON.parse(await fs.readFile(pageSnapshotPath, "utf8")) as PageSnapshotPayload;

    designSnapshot.tenantId = tenantId;
    pageSnapshot.tenantId = tenantId;
    pageSnapshot.projectId = designSnapshot.projectId;

    const user = await upsertUser(userId);
    const tenant = await upsertTenant(tenantId);
    await upsertMembership(tenant.id, user.id, "admin");
    const token = await reply.jwtSign({
      sub: userId,
      tenantId,
      roles: ["admin"],
    } satisfies AuthClaims);

    const storedSnapshot = await insertDesignSnapshot(designSnapshot);
    const tolerance = await resolveComparisonTolerance(tenant.id, 5);
    const comparison = compareDesignToPage(designSnapshot, pageSnapshot, tolerance.tolerancePx);
    const project = await upsertProject(tenant.id, designSnapshot.projectId);
    const storedComparison = await insertComparisonRun(
      tenant,
      project.id,
      designSnapshot,
      pageSnapshot,
      comparison,
      tolerance.tolerancePx
    );

    return {
      ok: true,
      token,
      tenantId: tenant.externalId,
      userId: user.externalId,
      projectId: designSnapshot.projectId,
      figmaFileId: designSnapshot.figmaFileId,
      comparisonRunId: storedComparison.id,
      comparisonStatus: comparison.status,
    } satisfies DevDemoSeedResponse;
  });

  app.get("/v1/session-context", async (request, reply) => {
    let auth: AuthClaims;

    try {
      auth = await request.jwtVerify<AuthClaims>();
    } catch {
      return reply.status(401).send({
        ok: false,
        message: "Unauthorized",
      });
    }

    const allowed = await userHasTenantAccess(auth.sub, auth.tenantId);

    if (!allowed) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant access denied",
      });
    }

    const context = await getSessionContext(auth.sub, auth.tenantId);

    if (!context) {
      return reply.status(404).send({
        ok: false,
        message: "No session context available",
      });
    }

    return {
      ok: true,
      context,
    };
  });

  app.get<{ Params: TenantUsageParams }>("/v1/tenants/:tenantId/usage", async (request, reply) => {
    let auth: AuthClaims;

    try {
      auth = await request.jwtVerify<AuthClaims>();
    } catch {
      return reply.status(401).send({
        ok: false,
        message: "Unauthorized",
      });
    }

    if (request.params.tenantId !== auth.tenantId) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant mismatch",
      });
    }

    const allowed = await userHasTenantAccess(auth.sub, auth.tenantId);

    if (!allowed) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant access denied",
      });
    }

    const tenant = await findTenantByExternalId(auth.tenantId);

    if (!tenant) {
      return reply.status(404).send({
        ok: false,
        message: "Tenant not found",
      });
    }

    const usage = await getTenantUsage(tenant.id);

    if (!usage) {
      return reply.status(404).send({
        ok: false,
        message: "Usage record not found",
      });
    }

    return {
      ok: true,
      usage,
      limits: resolveTenantPlanLimits(usage.planName),
      withinLimits: checkTenantUsageWithinLimits(usage).ok,
    };
  });

  app.get<{ Params: TenantTuningParams }>("/v1/tenants/:tenantId/tuning", async (request, reply) => {
    let auth: AuthClaims;

    try {
      auth = await request.jwtVerify<AuthClaims>();
    } catch {
      return reply.status(401).send({
        ok: false,
        message: "Unauthorized",
      });
    }

    if (request.params.tenantId !== auth.tenantId) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant mismatch",
      });
    }

    const allowed = await userHasTenantAccess(auth.sub, auth.tenantId);

    if (!allowed) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant access denied",
      });
    }

    const tenant = await findTenantByExternalId(auth.tenantId);

    if (!tenant) {
      return reply.status(404).send({
        ok: false,
        message: "Tenant not found",
      });
    }

    const tuning = await getTenantComparisonTuning(tenant.id);

    return {
      ok: true,
      tuning,
    };
  });

  app.get("/v1/releases", async () => {
    return {
      ok: true,
      releases: await listReleaseNotes(),
    };
  });

  app.get("/v1/releases/latest", async () => {
    return {
      ok: true,
      release: await getLatestReleaseNote(),
      maintenanceMessage: await getMaintenanceMessage(),
    };
  });

  app.get("/v1/announcements", async (request, reply) => {
    let auth: AuthClaims;

    try {
      auth = await request.jwtVerify<AuthClaims>();
    } catch {
      return reply.status(401).send({
        ok: false,
        message: "Unauthorized",
      });
    }

    const allowed = await userHasTenantAccess(auth.sub, auth.tenantId);

    if (!allowed) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant access denied",
      });
    }

    const feed = await listAnnouncementFeed(auth.sub);
    return {
      ok: true,
      unreadCount: feed.unreadCount,
      announcements: feed.announcements,
    } satisfies AnnouncementFeedResponse;
  });

  app.post<{ Params: AnnouncementAckParams }>("/v1/announcements/:id/ack", async (request, reply) => {
    let auth: AuthClaims;

    try {
      auth = await request.jwtVerify<AuthClaims>();
    } catch {
      return reply.status(401).send({
        ok: false,
        message: "Unauthorized",
      });
    }

    const allowed = await userHasTenantAccess(auth.sub, auth.tenantId);

    if (!allowed) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant access denied",
      });
    }

    const announcementId = Number(request.params.id);

    if (!Number.isInteger(announcementId) || announcementId <= 0) {
      return reply.status(400).send({
        ok: false,
        message: "Announcement id must be a positive integer",
      });
    }

    const acknowledged = await acknowledgeAnnouncement(auth.sub, announcementId);

    if (!acknowledged.announcement) {
      return reply.status(404).send({
        ok: false,
        message: "Announcement not found",
      });
    }

    return {
      ok: true,
      unreadCount: acknowledged.unreadCount,
      announcement: acknowledged.announcement,
    } satisfies AnnouncementAckResponse;
  });

  app.post<{ Params: ReleaseManagementParams; Body: ReleaseNoteBody }>("/v1/tenants/:tenantId/releases", async (request, reply) => {
    const access = await resolveTenantAdminAccess(request, reply);
    if (!access) {
      return;
    }

    if (request.params.tenantId !== access.tenantExternalId) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant mismatch",
      });
    }

    if (!request.body.version.trim() || !request.body.title.trim()) {
      return reply.status(400).send({
        ok: false,
        message: "Version and title are required",
      });
    }

    const release = await createReleaseNote({
      version: request.body.version.trim(),
      title: request.body.title.trim(),
      summary: request.body.summary?.trim() ?? "",
      highlights: request.body.highlights ?? [],
      createdByUserId: access.userId ?? "unknown",
    });

    return reply.status(201).send({
      ok: true,
      release,
    });
  });

  app.post<{ Params: ReleaseManagementParams; Body: MaintenanceBody }>("/v1/tenants/:tenantId/maintenance", async (request, reply) => {
    const access = await resolveTenantAdminAccess(request, reply);
    if (!access) {
      return;
    }

    if (request.params.tenantId !== access.tenantExternalId) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant mismatch",
      });
    }

    if (!request.body.message.trim()) {
      return reply.status(400).send({
        ok: false,
        message: "Maintenance message is required",
      });
    }

    const message = await setMaintenanceMessage({
      message: request.body.message.trim(),
      createdByUserId: access.userId ?? "unknown",
    });

    return {
      ok: true,
      message,
    };
  });

  app.get<{ Params: TenantBillingParams }>("/v1/billing/:tenantId", async (request, reply) => {
    let auth: AuthClaims;

    try {
      auth = await request.jwtVerify<AuthClaims>();
    } catch {
      return reply.status(401).send({
        ok: false,
        message: "Unauthorized",
      });
    }

    if (request.params.tenantId !== auth.tenantId) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant mismatch",
      });
    }

    const allowed = await userHasTenantAccess(auth.sub, auth.tenantId);

    if (!allowed) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant access denied",
      });
    }

    const tenant = await findTenantByExternalId(auth.tenantId);

    if (!tenant) {
      return reply.status(404).send({
        ok: false,
        message: "Tenant not found",
      });
    }

    const billing = await getTenantBillingInfo(tenant.id);

    if (!billing) {
      return reply.status(404).send({
        ok: false,
        message: "Billing record not found",
      });
    }

    return {
      ok: true,
      billing,
    };
  });

  app.post<{ Params: TenantBillingParams }>("/v1/billing/:tenantId/checkout-session", async (request, reply) => {
    let auth: AuthClaims;

    try {
      auth = await request.jwtVerify<AuthClaims>();
    } catch {
      return reply.status(401).send({
        ok: false,
        message: "Unauthorized",
      });
    }

    if (request.params.tenantId !== auth.tenantId) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant mismatch",
      });
    }

    const allowed = await userHasTenantAccess(auth.sub, auth.tenantId);

    if (!allowed) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant access denied",
      });
    }

    const tenant = await findTenantByExternalId(auth.tenantId);

    if (!tenant) {
      return reply.status(404).send({
        ok: false,
        message: "Tenant not found",
      });
    }

    const billing = await getTenantBillingInfo(tenant.id);

    if (!billing) {
      return reply.status(404).send({
        ok: false,
        message: "Billing record not found",
      });
    }

    const action = await createBillingCheckoutAction(billing, resolveBillingProviderConfig());

    return {
      ok: true,
      billing,
      action,
    };
  });

  app.post<{ Params: TenantBillingParams }>("/v1/billing/:tenantId/portal-session", async (request, reply) => {
    let auth: AuthClaims;

    try {
      auth = await request.jwtVerify<AuthClaims>();
    } catch {
      return reply.status(401).send({
        ok: false,
        message: "Unauthorized",
      });
    }

    if (request.params.tenantId !== auth.tenantId) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant mismatch",
      });
    }

    const allowed = await userHasTenantAccess(auth.sub, auth.tenantId);

    if (!allowed) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant access denied",
      });
    }

    const tenant = await findTenantByExternalId(auth.tenantId);

    if (!tenant) {
      return reply.status(404).send({
        ok: false,
        message: "Tenant not found",
      });
    }

    const billing = await getTenantBillingInfo(tenant.id);

    if (!billing) {
      return reply.status(404).send({
        ok: false,
        message: "Billing record not found",
      });
    }

    const action = await createBillingPortalAction(billing, resolveBillingProviderConfig());

    return {
      ok: true,
      billing,
      action,
    };
  });

  app.post<{ Body: ApiKeyCreateBody }>("/v1/integrations/api-keys", async (request, reply) => {
    let auth: AuthClaims;

    try {
      auth = await request.jwtVerify<AuthClaims>();
    } catch {
      return reply.status(401).send({
        ok: false,
        message: "Unauthorized",
      });
    }

    if (request.body.tenantId !== auth.tenantId) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant mismatch",
      });
    }

    const allowed = await userHasTenantAccess(auth.sub, auth.tenantId);

    if (!allowed) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant access denied",
      });
    }

    const tenant = await findTenantByExternalId(auth.tenantId);

    if (!tenant) {
      return reply.status(404).send({
        ok: false,
        message: "Tenant not found",
      });
    }

    const usage = await getTenantUsage(tenant.id);

    if (usage) {
      const limits = resolveTenantPlanLimits(usage.planName);

      if (usage.apiKeyCount >= limits.maxApiKeys) {
        return reply.status(429).send({
          ok: false,
          message: "API key quota exceeded",
        });
      }
    }

    const requestedScopes = request.body.scopes?.length ? request.body.scopes : ["comparisons:write"];

    if (
      requestedScopes.some((scope) => !ALLOWED_API_KEY_SCOPES.has(scope)) ||
      requestedScopes.length === 0
    ) {
      return reply.status(400).send({
        ok: false,
        message: "Unsupported scope requested",
      });
    }

    const apiKey = await createTenantApiKey(tenant.id, request.body.name, requestedScopes);

    return {
      ok: true,
      apiKey: {
        id: apiKey.id,
        tenantId: request.body.tenantId,
        name: apiKey.name,
        prefix: apiKey.prefix,
        scopes: apiKey.scopes,
        createdAt: apiKey.createdAt,
        rawKey: apiKey.rawKey,
      },
    };
  });

  app.get("/v1/integrations/api-keys", async (request, reply) => {
    let auth: AuthClaims;

    try {
      auth = await request.jwtVerify<AuthClaims>();
    } catch {
      return reply.status(401).send({
        ok: false,
        message: "Unauthorized",
      });
    }

    const allowed = await userHasTenantAccess(auth.sub, auth.tenantId);

    if (!allowed) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant access denied",
      });
    }

    const tenant = await findTenantByExternalId(auth.tenantId);

    if (!tenant) {
      return reply.status(404).send({
        ok: false,
        message: "Tenant not found",
      });
    }

    const apiKeys = await listTenantApiKeys(tenant.id);

    return {
      ok: true,
      apiKeys,
    };
  });

  app.post<{ Params: ApiKeyRevokeParams }>("/v1/integrations/api-keys/:id/revoke", async (request, reply) => {
    let auth: AuthClaims;

    try {
      auth = await request.jwtVerify<AuthClaims>();
    } catch {
      return reply.status(401).send({
        ok: false,
        message: "Unauthorized",
      });
    }

    const allowed = await userHasTenantAccess(auth.sub, auth.tenantId);

    if (!allowed) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant access denied",
      });
    }

    const tenant = await findTenantByExternalId(auth.tenantId);

    if (!tenant) {
      return reply.status(404).send({
        ok: false,
        message: "Tenant not found",
      });
    }

    const apiKeyId = Number.parseInt(request.params.id, 10);

    if (!Number.isFinite(apiKeyId)) {
      return reply.status(400).send({
        ok: false,
        message: "Invalid API key id",
      });
    }

    const revoked = await revokeTenantApiKey(tenant.id, apiKeyId);

    if (!revoked) {
      return reply.status(404).send({
        ok: false,
        message: "API key not found",
      });
    }

    return {
      ok: true,
    };
  });

  app.post<{ Body: WebhookCreateBody }>("/v1/integrations/webhooks", async (request, reply) => {
    let auth: AuthClaims;

    try {
      auth = await request.jwtVerify<AuthClaims>();
    } catch {
      return reply.status(401).send({
        ok: false,
        message: "Unauthorized",
      });
    }

    if (request.body.tenantId !== auth.tenantId) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant mismatch",
      });
    }

    const allowed = await userHasTenantAccess(auth.sub, auth.tenantId);

    if (!allowed) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant access denied",
      });
    }

    const tenant = await findTenantByExternalId(auth.tenantId);

    if (!tenant) {
      return reply.status(404).send({
        ok: false,
        message: "Tenant not found",
      });
    }

    const usage = await getTenantUsage(tenant.id);

    if (usage) {
      const limits = resolveTenantPlanLimits(usage.planName);

      if (usage.activeWebhookCount >= limits.maxWebhooks) {
        return reply.status(429).send({
          ok: false,
          message: "Webhook quota exceeded",
        });
      }
    }

    const events = request.body.events?.length ? request.body.events : ["comparison.created"];
    if (events.some((event) => event !== "comparison.created" && event !== "comparison.failed")) {
      return reply.status(400).send({
        ok: false,
        message: "Unsupported webhook event",
      });
    }

    const webhook = await createTenantWebhook(tenant.id, request.body.name, request.body.targetUrl, events);

    return {
      ok: true,
      webhook: {
        id: webhook.id,
        tenantId: auth.tenantId,
        name: webhook.name,
        targetUrl: webhook.targetUrl,
        events: webhook.events,
        createdAt: webhook.createdAt,
        rawSecret: webhook.rawSecret,
      },
    };
  });

  app.get("/v1/integrations/webhooks", async (request, reply) => {
    let auth: AuthClaims;

    try {
      auth = await request.jwtVerify<AuthClaims>();
    } catch {
      return reply.status(401).send({
        ok: false,
        message: "Unauthorized",
      });
    }

    const allowed = await userHasTenantAccess(auth.sub, auth.tenantId);

    if (!allowed) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant access denied",
      });
    }

    const tenant = await findTenantByExternalId(auth.tenantId);

    if (!tenant) {
      return reply.status(404).send({
        ok: false,
        message: "Tenant not found",
      });
    }

    const webhooks = await listTenantWebhooks(tenant.id);

    return {
      ok: true,
      webhooks,
    };
  });

  app.post<{ Params: WebhookRevokeParams }>("/v1/integrations/webhooks/:id/revoke", async (request, reply) => {
    let auth: AuthClaims;

    try {
      auth = await request.jwtVerify<AuthClaims>();
    } catch {
      return reply.status(401).send({
        ok: false,
        message: "Unauthorized",
      });
    }

    const allowed = await userHasTenantAccess(auth.sub, auth.tenantId);

    if (!allowed) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant access denied",
      });
    }

    const tenant = await findTenantByExternalId(auth.tenantId);

    if (!tenant) {
      return reply.status(404).send({
        ok: false,
        message: "Tenant not found",
      });
    }

    const webhookId = Number.parseInt(request.params.id, 10);

    if (!Number.isFinite(webhookId)) {
      return reply.status(400).send({
        ok: false,
        message: "Invalid webhook id",
      });
    }

    const revoked = await revokeTenantWebhook(tenant.id, webhookId);

    if (!revoked) {
      return reply.status(404).send({
        ok: false,
        message: "Webhook not found",
      });
    }

    return {
      ok: true,
    };
  });

  app.get<{ Params: WebhookDeliveriesParams; Querystring: WebhookDeliveriesQuery }>(
    "/v1/integrations/webhooks/:id/deliveries",
    async (request, reply) => {
      let auth: AuthClaims;

      try {
        auth = await request.jwtVerify<AuthClaims>();
      } catch {
        return reply.status(401).send({
          ok: false,
          message: "Unauthorized",
        });
      }

      const allowed = await userHasTenantAccess(auth.sub, auth.tenantId);

      if (!allowed) {
        return reply.status(403).send({
          ok: false,
          message: "Tenant access denied",
        });
      }

      const tenant = await findTenantByExternalId(auth.tenantId);

      if (!tenant) {
        return reply.status(404).send({
          ok: false,
          message: "Tenant not found",
        });
      }

      const webhookId = Number.parseInt(request.params.id, 10);

      if (!Number.isFinite(webhookId)) {
        return reply.status(400).send({
          ok: false,
          message: "Invalid webhook id",
        });
      }

      const webhook = await findTenantWebhookById(tenant.id, webhookId);

      if (!webhook) {
        return reply.status(404).send({
          ok: false,
          message: "Webhook not found",
        });
      }

      const limit = Math.min(Number.parseInt(request.query.limit ?? "20", 10) || 20, 100);
      const deliveries = await listTenantWebhookDeliveries(tenant.id, webhook.id, limit);

      return {
        ok: true,
        webhook,
        deliveries,
      };
    }
  );

  app.post<{ Params: WebhookDeliveryRedeliverParams }>(
    "/v1/integrations/webhooks/:id/deliveries/:deliveryId/redeliver",
    async (request, reply) => {
      let auth: AuthClaims;

      try {
        auth = await request.jwtVerify<AuthClaims>();
      } catch {
        return reply.status(401).send({
          ok: false,
          message: "Unauthorized",
        });
      }

      const allowed = await userHasTenantAccess(auth.sub, auth.tenantId);

      if (!allowed) {
        return reply.status(403).send({
          ok: false,
          message: "Tenant access denied",
        });
      }

      const tenant = await findTenantByExternalId(auth.tenantId);

      if (!tenant) {
        return reply.status(404).send({
          ok: false,
          message: "Tenant not found",
        });
      }

      const webhookId = Number.parseInt(request.params.id, 10);
      const deliveryId = Number.parseInt(request.params.deliveryId, 10);

      if (!Number.isFinite(webhookId) || !Number.isFinite(deliveryId)) {
        return reply.status(400).send({
          ok: false,
          message: "Invalid webhook delivery id",
        });
      }

      const delivery = await redeliverTenantWebhookDelivery(tenant.id, webhookId, deliveryId);

      if (!delivery) {
        return reply.status(404).send({
          ok: false,
          message: "Webhook delivery not found",
        });
      }

      return {
        ok: true,
        delivery,
      };
    }
  );

  app.post<{ Body: DesignSnapshotPayload }>("/v1/design-snapshots", async (request, reply) => {
    const body = request.body as DesignSnapshotPayload;
    let auth: AuthClaims;

    try {
      auth = await request.jwtVerify<AuthClaims>();
    } catch {
      return reply.status(401).send({
        ok: false,
        message: "Unauthorized",
      });
    }

    if (body.tenantId !== auth.tenantId) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant mismatch",
      });
    }

    const allowed = await userHasTenantAccess(auth.sub, auth.tenantId);

    if (!allowed) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant access denied",
      });
    }

    const tenant = await findTenantByExternalId(auth.tenantId);

    if (!tenant) {
      return reply.status(404).send({
        ok: false,
        message: "Tenant not found",
      });
    }

    const snapshotUsage = await getTenantUsage(tenant.id);

    if (snapshotUsage) {
      const limits = resolveTenantPlanLimits(snapshotUsage.planName);

      if (snapshotUsage.snapshotCount >= limits.maxSnapshots) {
        return reply.status(429).send({
          ok: false,
          message: "Snapshot quota exceeded",
        });
      }
    }

    const result = validateDesignSnapshot(body);

    if (!result.valid) {
      return reply.status(400).send({
        ok: false,
        issues: result.issues,
      });
    }

    const storedSnapshot = await insertDesignSnapshot(body);

    return reply.status(201).send({
      ok: true,
      storedSnapshot,
      snapshot: body,
      comparison: createEmptyComparisonResult(body.tenantId, body.projectId),
    });
  });

  app.post<{ Body: ComparisonPreviewBody }>("/v1/comparisons/preview", async (request, reply) => {
    const body = request.body as ComparisonPreviewBody;
    const designValidation = validateDesignSnapshot(body.designSnapshot);
    const pageValidation = validatePageSnapshot(body.pageSnapshot);

    if (!designValidation.valid || !pageValidation.valid) {
      return reply.status(400).send({
        ok: false,
        designIssues: designValidation.issues,
        pageIssues: pageValidation.issues,
      });
    }

    const comparison: ComparisonResult = compareDesignToPage(
      body.designSnapshot,
      body.pageSnapshot,
      body.tolerancePx ?? 5
    );

    return {
      ok: true,
      comparison,
    };
  });

  app.post<{ Body: QaCheckBody }>("/v1/qa/check", async (request, reply) => {
    const body = request.body as QaCheckBody;
    let auth: AuthClaims;

    try {
      auth = await request.jwtVerify<AuthClaims>();
    } catch {
      return reply.status(401).send({
        ok: false,
        message: "Unauthorized",
      });
    }

    if (body.tenantId !== auth.tenantId) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant mismatch",
      });
    }

    const allowed = await userHasTenantAccess(auth.sub, auth.tenantId);

    if (!allowed) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant access denied",
      });
    }

    const figmaUrl = body.figmaUrl.trim();
    const pageUrl = body.pageUrl.trim();

    if (!figmaUrl) {
      return reply.status(400).send({
        ok: false,
        message: "Figma Design URL is required",
      });
    }

    if (!pageUrl) {
      return reply.status(400).send({
        ok: false,
        message: "Live Page URL is required",
      });
    }

    try {
      parseFigmaUrl(figmaUrl);
    } catch (error) {
      return reply.status(400).send({
        ok: false,
        message: error instanceof Error ? error.message : "Invalid Figma URL. Please paste a valid design link.",
      });
    }

    try {
      const parsedPageUrl = new URL(pageUrl);
      if (
        parsedPageUrl.hostname === "localhost" ||
        parsedPageUrl.hostname === "127.0.0.1" ||
        parsedPageUrl.hostname === "::1"
      ) {
        if ((process.env.NODE_ENV ?? "").toLowerCase() === "production") {
          return reply.status(400).send({
            ok: false,
            message: "Local URLs may not work in production. Use a staging or public URL.",
          });
        }
      }
    } catch {
      return reply.status(400).send({
        ok: false,
        message: "Live Page URL is invalid",
      });
    }

    const tenant = await upsertTenant(auth.tenantId);
    const project = await upsertProject(tenant.id, body.projectId);
    const capture = resolveDeviceCapture(body.viewport);
    const tolerancePx =
      typeof body.tolerancePx === "number" && Number.isFinite(body.tolerancePx)
        ? body.tolerancePx
        : resolveDefaultTolerance();

    try {
      const designSnapshot = await buildDesignSnapshotFromFigmaUrl({
        tenantId: tenant.externalId,
        projectId: project.externalId,
        figmaUrl,
        viewportWidth: capture.viewportWidth,
        viewportHeight: capture.viewportHeight,
      });
      const pageSnapshot = await extractPageSnapshotFromUrl(pageUrl, {
        tenantId: tenant.externalId,
        projectId: project.externalId,
        capture,
      });

      const designValidation = validateDesignSnapshot(designSnapshot);
      const pageValidation = validatePageSnapshot(pageSnapshot);

      if (!designValidation.valid || !pageValidation.valid) {
        return reply.status(400).send({
          ok: false,
          designIssues: designValidation.issues,
          pageIssues: pageValidation.issues,
        });
      }

      const storedSnapshot = await insertDesignSnapshot(designSnapshot);
      const comparison = compareDesignToPage(designSnapshot, pageSnapshot, tolerancePx);
      const storedComparison = await insertComparisonRun(
        tenant,
        project.id,
        designSnapshot,
        pageSnapshot,
        comparison,
        tolerancePx
      );

      const createdEvent = buildWebhookComparisonEvent(
        "comparison.created",
        tenant.externalId,
        comparison,
        storedComparison,
        designSnapshot,
        pageSnapshot
      );

      await deliverComparisonCreatedWebhooks(tenant.id, createdEvent);

      if (comparison.status !== "pass") {
        const failedEvent = buildWebhookComparisonEvent(
          "comparison.failed",
          tenant.externalId,
          comparison,
          storedComparison,
          designSnapshot,
          pageSnapshot
        );

        await deliverComparisonFailedWebhooks(tenant.id, failedEvent);
      }

      return reply.status(201).send({
        ok: true,
        comparison,
        storedComparison,
        storedSnapshot,
        designSnapshot,
        pageSnapshot,
        figmaFileKey: designSnapshot.figmaFileId,
      });
    } catch (error) {
      return reply.status(400).send({
        ok: false,
        message: error instanceof Error ? error.message : "Failed to run QA check",
      });
    }
  });

  app.post<{ Body: ComparisonRunBody }>("/v1/comparisons", async (request, reply) => {
    const body = request.body as ComparisonRunBody;
    let auth: AuthClaims;

    try {
      auth = await request.jwtVerify<AuthClaims>();
    } catch {
      return reply.status(401).send({
        ok: false,
        message: "Unauthorized",
      });
    }

    if (body.tenantId !== auth.tenantId) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant mismatch",
      });
    }

    const allowed = await userHasTenantAccess(auth.sub, auth.tenantId);

    if (!allowed) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant access denied",
      });
    }

    const designValidation = validateDesignSnapshot(body.designSnapshot);
    const pageValidation = validatePageSnapshot(body.pageSnapshot);

    if (!designValidation.valid || !pageValidation.valid) {
      return reply.status(400).send({
        ok: false,
        designIssues: designValidation.issues,
        pageIssues: pageValidation.issues,
      });
    }

    const tenant = await upsertTenant(body.tenantId);
    const project = await upsertProject(tenant.id, body.projectId);
    const tolerance = await resolveComparisonTolerance(tenant.id, body.tolerancePx);
    const comparison: ComparisonResult = compareDesignToPage(
      body.designSnapshot,
      body.pageSnapshot,
      tolerance.tolerancePx
    );

    const comparisonUsage = await getTenantUsage(tenant.id);

    if (comparisonUsage) {
      const limits = resolveTenantPlanLimits(comparisonUsage.planName);

      if (comparisonUsage.comparisonRunCount >= limits.maxComparisonRuns) {
        return reply.status(429).send({
          ok: false,
          message: "Comparison quota exceeded",
        });
      }
    }

    const storedComparison = await insertComparisonRun(
      tenant,
      project.id,
      body.designSnapshot,
      body.pageSnapshot,
      comparison,
      tolerance.tolerancePx
    );

    const createdEvent = buildWebhookComparisonEvent(
      "comparison.created",
      tenant.externalId,
      comparison,
      storedComparison,
      body.designSnapshot,
      body.pageSnapshot
    );

    await deliverComparisonCreatedWebhooks(tenant.id, createdEvent);

    if (comparison.status !== "pass") {
      const failedEvent = buildWebhookComparisonEvent(
        "comparison.failed",
        tenant.externalId,
        comparison,
        storedComparison,
        body.designSnapshot,
        body.pageSnapshot
      );

      await deliverComparisonFailedWebhooks(tenant.id, failedEvent);
    }

    return reply.status(201).send({
      ok: true,
      comparison,
      storedComparison,
    });
  });

  app.post<{ Body: IntegrationComparisonBody }>("/v1/integrations/comparisons", async (request, reply) => {
    const body = request.body as IntegrationComparisonBody;
    const rawKey = request.headers["x-api-key"];

    if (typeof rawKey !== "string" || !rawKey.trim()) {
      return reply.status(401).send({
        ok: false,
        message: "API key required",
      });
    }

    const apiKey = await resolveTenantApiKey(rawKey.trim());

    if (!apiKey) {
      return reply.status(401).send({
        ok: false,
        message: "Invalid API key",
      });
    }

    if (!apiKey.scopes.includes("comparisons:write")) {
      return reply.status(403).send({
        ok: false,
        message: "API key does not have comparisons:write scope",
      });
    }

    const tenant = await findTenantById(apiKey.tenantId);

    if (!tenant) {
      return reply.status(404).send({
        ok: false,
        message: "Tenant not found",
      });
    }

    const comparisonUsage = await getTenantUsage(tenant.id);

    if (comparisonUsage) {
      const limits = resolveTenantPlanLimits(comparisonUsage.planName);

      if (comparisonUsage.comparisonRunCount >= limits.maxComparisonRuns) {
        return reply.status(429).send({
          ok: false,
          message: "Comparison quota exceeded",
        });
      }
    }

    const designValidation = validateDesignSnapshot(body.designSnapshot);
    const pageValidation = validatePageSnapshot(body.pageSnapshot);

    if (!designValidation.valid || !pageValidation.valid) {
      return reply.status(400).send({
        ok: false,
        designIssues: designValidation.issues,
        pageIssues: pageValidation.issues,
      });
    }

    const tolerance = await resolveComparisonTolerance(tenant.id, body.tolerancePx);
    const comparison: ComparisonResult = compareDesignToPage(
      body.designSnapshot,
      body.pageSnapshot,
      tolerance.tolerancePx
    );

    const project = await upsertProject(tenant.id, body.projectId);
    const storedComparison = await insertComparisonRun(
      tenant,
      project.id,
      body.designSnapshot,
      body.pageSnapshot,
      comparison,
      tolerance.tolerancePx
    );

    const createdEvent = buildWebhookComparisonEvent(
      "comparison.created",
      tenant.externalId,
      comparison,
      storedComparison,
      body.designSnapshot,
      body.pageSnapshot
    );

    await deliverComparisonCreatedWebhooks(tenant.id, createdEvent);

    if (comparison.status !== "pass") {
      const failedEvent = buildWebhookComparisonEvent(
        "comparison.failed",
        tenant.externalId,
        comparison,
        storedComparison,
        body.designSnapshot,
        body.pageSnapshot
      );

      await deliverComparisonFailedWebhooks(tenant.id, failedEvent);
    }

    return reply.status(201).send({
      ok: true,
      comparison,
      storedComparison,
      apiKeyPrefix: apiKey.keyPrefix,
    });
  });

  app.get<{ Querystring: ComparisonHistoryQuery }>("/v1/comparisons", async (request, reply) => {
    const access = await resolveTenantReadAccess(request, reply, ["comparisons:read"]);
    if (!access) {
      return;
    }
    const limit = Math.min(Number.parseInt(request.query.limit ?? "20", 10) || 20, 100);

    if (request.query.projectId) {
      const project = await findProjectByExternalId(access.tenantId, request.query.projectId);

      if (!project) {
        return reply.status(404).send({
          ok: false,
          message: "Project not found",
        });
      }

      const filteredHistory = await listComparisonHistory(
        access.tenantId,
        project.id,
        request.query.figmaFileId,
        limit
      );

      return {
        ok: true,
        history: filteredHistory,
      };
    }

    const historyAll = await listComparisonHistory(access.tenantId, undefined, request.query.figmaFileId, limit);

    return {
      ok: true,
      history: historyAll,
    };
  });

  app.get<{ Params: ComparisonDetailParams }>("/v1/comparisons/:id", async (request, reply) => {
    const access = await resolveTenantReadAccess(request, reply, ["comparisons:read"]);
    if (!access) {
      return;
    }
    const runId = Number.parseInt(request.params.id, 10);

    if (!Number.isFinite(runId)) {
      return reply.status(400).send({
        ok: false,
        message: "Invalid comparison run id",
      });
    }

    const run = await getComparisonRunById(access.tenantId, runId);

    if (!run) {
      return reply.status(404).send({
        ok: false,
        message: "Comparison run not found",
      });
    }

    return {
      ok: true,
      run,
    };
  });

  app.get<{ Params: ComparisonDetailParams }>("/v1/comparisons/:id/feedback", async (request, reply) => {
    const access = await resolveJwtTenantAccess(request, reply);
    if (!access) {
      return;
    }

    const runId = Number.parseInt(request.params.id, 10);

    if (!Number.isFinite(runId)) {
      return reply.status(400).send({
        ok: false,
        message: "Invalid comparison run id",
      });
    }

    const run = await getComparisonRunById(access.tenantId, runId);

    if (!run) {
      return reply.status(404).send({
        ok: false,
        message: "Comparison run not found",
      });
    }

    const feedback = await listComparisonFeedback(access.tenantId, runId);

    return {
      ok: true,
      feedback,
    };
  });

  app.post<{ Params: ComparisonDetailParams; Body: ComparisonFeedbackBody }>("/v1/comparisons/:id/feedback", async (request, reply) => {
    const access = await resolveJwtTenantAccess(request, reply);
    if (!access) {
      return;
    }

    const runId = Number.parseInt(request.params.id, 10);

    if (!Number.isFinite(runId)) {
      return reply.status(400).send({
        ok: false,
        message: "Invalid comparison run id",
      });
    }

    if (!Number.isInteger(request.body.rating) || request.body.rating < 1 || request.body.rating > 5) {
      return reply.status(400).send({
        ok: false,
        message: "Rating must be between 1 and 5",
      });
    }

    if (!["positive", "neutral", "negative"].includes(request.body.sentiment)) {
      return reply.status(400).send({
        ok: false,
        message: "Unsupported sentiment",
      });
    }

    const run = await getComparisonRunById(access.tenantId, runId);

    if (!run) {
      return reply.status(404).send({
        ok: false,
        message: "Comparison run not found",
      });
    }

    const feedback = await addComparisonFeedback({
      tenantId: access.tenantId,
      comparisonRunId: runId,
      createdByUserId: access.userId ?? "unknown",
      rating: request.body.rating,
      sentiment: request.body.sentiment,
      notes: request.body.notes ?? "",
      tags: request.body.tags ?? [],
    });

    return reply.status(201).send({
      ok: true,
      feedback,
    });
  });

  app.get<{ Params: ComparisonDetailParams }>("/v1/comparisons/:id/issues/statuses", async (request, reply) => {
    const access = await resolveJwtTenantAccess(request, reply);
    if (!access) {
      return;
    }

    const runId = Number.parseInt(request.params.id, 10);

    if (!Number.isFinite(runId)) {
      return reply.status(400).send({
        ok: false,
        message: "Invalid comparison run id",
      });
    }

    const run = await getComparisonRunById(access.tenantId, runId);

    if (!run) {
      return reply.status(404).send({
        ok: false,
        message: "Comparison run not found",
      });
    }

    const statuses = await listComparisonIssueStatuses(access.tenantId, runId);

    return {
      ok: true,
      statuses,
    };
  });

  app.post<{ Params: ComparisonDetailParams; Body: ComparisonIssueStatusBody }>("/v1/comparisons/:id/issues/statuses", async (request, reply) => {
    const access = await resolveJwtTenantAccess(request, reply);
    if (!access) {
      return;
    }

    const runId = Number.parseInt(request.params.id, 10);

    if (!Number.isFinite(runId)) {
      return reply.status(400).send({
        ok: false,
        message: "Invalid comparison run id",
      });
    }

    if (!request.body.issueCode.trim() || !request.body.issuePath.trim()) {
      return reply.status(400).send({
        ok: false,
        message: "Issue code and path are required",
      });
    }

    if (!["open", "resolved", "ignored"].includes(request.body.status)) {
      return reply.status(400).send({
        ok: false,
        message: "Unsupported issue status",
      });
    }

    const run = await getComparisonRunById(access.tenantId, runId);

    if (!run) {
      return reply.status(404).send({
        ok: false,
        message: "Comparison run not found",
      });
    }

    const status = await upsertComparisonIssueStatus({
      tenantId: access.tenantId,
      comparisonRunId: runId,
      issueCode: request.body.issueCode.trim(),
      issuePath: request.body.issuePath.trim(),
      issueSeverity: request.body.issueSeverity,
      status: request.body.status,
      note: request.body.note ?? "",
      resolvedByUserId: access.userId ?? "unknown",
    });

    return reply.status(201).send({
      ok: true,
      status,
    });
  });

  app.get<{ Params: ComparisonDetailParams }>("/v1/comparisons/:id/report", async (request, reply) => {
    const access = await resolveTenantReadAccess(request, reply, ["reports:read"]);
    if (!access) {
      return;
    }
    const runId = Number.parseInt(request.params.id, 10);

    if (!Number.isFinite(runId)) {
      return reply.status(400).send({
        ok: false,
        message: "Invalid comparison run id",
      });
    }

    const report = await getComparisonRunReportById(access.tenantId, runId);

    if (!report) {
      return reply.status(404).send({
        ok: false,
        message: "Comparison run not found",
      });
    }

    return {
      ok: true,
      report,
    };
  });

  app.post<{ Body: PageSnapshotExtractionBody }>("/v1/pages/snapshot", async (request, reply) => {
    const body = request.body as PageSnapshotExtractionBody;
    let auth: AuthClaims;

    try {
      auth = await request.jwtVerify<AuthClaims>();
    } catch {
      return reply.status(401).send({
        ok: false,
        message: "Unauthorized",
      });
    }

    if (body.tenantId !== auth.tenantId) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant mismatch",
      });
    }

    const allowed = await userHasTenantAccess(auth.sub, auth.tenantId);

    if (!allowed) {
      return reply.status(403).send({
        ok: false,
        message: "Tenant access denied",
      });
    }

    try {
      const snapshot = await extractPageSnapshotFromUrl(body.pageUrl, {
        tenantId: body.tenantId,
        projectId: body.projectId,
        schemaVersion: body.schemaVersion,
        capture: body.capture,
      });

      const validation = validatePageSnapshot(snapshot);

      if (!validation.valid) {
        return reply.status(500).send({
          ok: false,
          message: "Extracted page snapshot failed validation",
          issues: validation.issues,
        });
      }

      return {
        ok: true,
        snapshot,
      };
    } catch (error) {
      return reply.status(400).send({
        ok: false,
        message: error instanceof Error ? error.message : "Failed to extract page snapshot",
      });
    }
  });
}

