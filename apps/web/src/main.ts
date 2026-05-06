import { serializeComparisonReportToPdfBytes } from "./pdf";
import "./styles.css";

type SessionContext = {
  tenantId: string;
  userId: string;
  projects: Array<{
    id: number;
    externalId: string;
    name: string | null;
    figmaFiles: Array<{
      id: number;
      externalId: string;
      name: string | null;
    }>;
  }>;
};

type TenantUsageResponse = {
  ok: true;
  usage: {
    tenantId: number;
    externalId: string;
    planName: string;
    planStatus: string;
    trialEndsAt: string | null;
    snapshotCount: number;
    comparisonRunCount: number;
    apiKeyCount: number;
    webhookCount: number;
    activeWebhookCount: number;
    membershipCount: number;
  };
  limits: {
    maxSnapshots: number;
    maxComparisonRuns: number;
    maxApiKeys: number;
    maxWebhooks: number;
    maxMembers: number;
  };
  withinLimits: boolean;
};

type TenantTuningResponse = {
  ok: true;
  tuning: {
    tenantId: number;
    feedbackCount: number;
    averageRating: number;
    positiveCount: number;
    neutralCount: number;
    negativeCount: number;
    tagCounts: Array<{ tag: string; count: number }>;
    recommendedTolerancePx: number;
    rationale: string;
  };
};

type ReleaseNote = {
  version: string;
  releasedAt: string;
  title: string;
  summary: string;
  highlights: string[];
};

type ReleasesResponse = {
  ok: true;
  releases: ReleaseNote[];
};

type LatestReleaseResponse = {
  ok: true;
  release: ReleaseNote;
  maintenanceMessage: string | null;
};

type DemoSeedResponse = {
  ok: true;
  token: string;
  tenantId: string;
  userId: string;
  projectId: string;
  figmaFileId: string;
  comparisonRunId: number;
  comparisonStatus: "pass" | "warn" | "fail";
};

type AnnouncementItem = {
  id: number;
  kind: "release" | "maintenance";
  version: string | null;
  title: string;
  summary: string;
  highlights: string[];
  message: string;
  releasedAt: string;
  acknowledged: boolean;
  acknowledgedAt: string | null;
};

type AnnouncementsResponse = {
  ok: true;
  unreadCount: number;
  announcements: AnnouncementItem[];
};

type AnnouncementAckResponse = {
  ok: true;
  unreadCount: number;
  announcement: AnnouncementItem;
};

type TenantBillingResponse = {
  ok: true;
  billing: {
    tenantId: number;
    externalId: string;
    planName: string;
    planStatus: string;
    trialEndsAt: string | null;
    billingProvider: string;
    billingCustomerId: string | null;
    apiKeyCount: number;
  };
};

type BillingActionResponse = {
  ok: true;
  billing: TenantBillingResponse["billing"];
  action: {
    provider: string;
    url: string | null;
    message: string;
  };
};

type ComparisonHistoryItem = {
  id: number;
  tenantId: number;
  projectId: number;
  figmaFileExternalId: string | null;
  figmaFileName: string | null;
  status: "pass" | "warn" | "fail";
  tolerancePx: number;
  createdAt: string;
};

type ComparisonRunDetail = ComparisonHistoryItem & {
  designSnapshot: unknown;
  pageSnapshot: unknown;
  issues: Array<{
    code: string;
    severity: "minor" | "major" | "critical";
    message: string;
    path: string;
  }>;
};

type ComparisonFeedbackRecord = {
  id: number;
  tenantId: number;
  comparisonRunId: number;
  createdByUserId: string;
  rating: number;
  sentiment: "positive" | "neutral" | "negative";
  notes: string;
  tags: string[];
  createdAt: string;
};

type ComparisonIssueStatusRecord = {
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
};

type ComparisonReport = {
  runId: number;
  createdAt: string;
  tolerancePx: number;
  tenantId: string;
  projectId: string;
  figmaFileId: string | null;
  summary: {
    status: "pass" | "warn" | "fail";
    totalIssues: number;
    minorIssues: number;
    majorIssues: number;
    criticalIssues: number;
    tolerancePx: number;
  };
  issueGroups: Array<{
    code: string;
    count: number;
    severity: "minor" | "major" | "critical";
  }>;
  issuePatterns: Array<{
    code: string;
    severity: "minor" | "major" | "critical";
    count: number;
    samplePaths: string[];
    sampleMessage: string;
  }>;
  issues: ComparisonRunDetail["issues"];
  designSnapshot: unknown;
  pageSnapshot: unknown;
};

type WebhookRecord = {
  id: number;
  tenantId: number;
  name: string;
  targetUrl: string;
  secret: string;
  events: Array<"comparison.created" | "comparison.failed">;
  createdAt: string;
  revokedAt: string | null;
};

type WebhookDeliveryRecord = {
  id: number;
  tenantWebhookId: number;
  webhookName: string;
  eventType: "comparison.created" | "comparison.failed";
  payload: unknown;
  responseStatus: number | null;
  errorText: string | null;
  attemptCount: number;
  status: "delivered" | "dead_lettered";
  deliveredAt: string;
  lastAttemptAt: string;
  deadLetteredAt: string | null;
};

type StatusFilter = "all" | "pass" | "warn" | "fail";
type DevicePreset = "desktop" | "tablet" | "mobile";

type PageCaptureSettings = {
  viewportWidth: number;
  viewportHeight: number;
  deviceScaleFactor: number;
  userAgent: string;
};

type QaCheckResponse = {
  ok: true;
  comparison: ComparisonResult;
  storedComparison: { id: number; status: ComparisonResult["status"] };
  storedSnapshot: unknown;
  designSnapshot: unknown;
  pageSnapshot: unknown;
  figmaFileKey: string;
};

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found");
}

function getRequiredElement<T extends Element>(id: string): T {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }

  return element as T;
}

function getCurrentRoute(): "dashboard" | "settings" {
  return location.hash === "#settings" ? "settings" : "dashboard";
}

const state = {
  apiBaseUrl: localStorage.getItem("d2p-api-base-url") ?? "http://127.0.0.1:3001",
  jwt: localStorage.getItem("auth_token") ?? localStorage.getItem("d2p-jwt") ?? "",
  appUrl: localStorage.getItem("d2p-live-page-url") ?? localStorage.getItem("d2p-app-url") ?? "http://localhost:3000",
  figmaDesignUrl: localStorage.getItem("d2p-figma-design-url") ?? "",
  projectId: localStorage.getItem("d2p-project-id") ?? "",
  figmaFileId: localStorage.getItem("d2p-figma-file-id") ?? "",
  limit: Number(localStorage.getItem("d2p-limit") ?? "20"),
  statusFilter: (localStorage.getItem("d2p-status-filter") ?? "all") as StatusFilter,
  devicePreset: (localStorage.getItem("d2p-device-preset") ?? "desktop") as DevicePreset,
  viewportWidth: Number(localStorage.getItem("d2p-viewport-width") ?? "1440"),
  viewportHeight: Number(localStorage.getItem("d2p-viewport-height") ?? "1024"),
  deviceScaleFactor: Number(localStorage.getItem("d2p-device-scale-factor") ?? "1"),
  userAgent:
    localStorage.getItem("d2p-user-agent") ??
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  session: null as SessionContext | null,
  usage: null as TenantUsageResponse | null,
  billing: null as TenantBillingResponse | null,
  tuning: null as TenantTuningResponse | null,
  releases: [] as ReleaseNote[],
  latestRelease: null as LatestReleaseResponse | null,
  announcements: [] as AnnouncementItem[],
  unreadAnnouncementCount: 0,
  releaseDraft: {
    version: localStorage.getItem("d2p-release-version") ?? "",
    title: localStorage.getItem("d2p-release-title") ?? "",
    summary: localStorage.getItem("d2p-release-summary") ?? "",
    highlights: localStorage.getItem("d2p-release-highlights") ?? "",
  },
  maintenanceDraft: {
    message: localStorage.getItem("d2p-maintenance-message") ?? "",
  },
  history: [] as ComparisonHistoryItem[],
  selectedRun: null as ComparisonRunDetail | null,
  selectedIssueKey: null as string | null,
  hoveredIssueKey: null as string | null,
  selectedReport: null as ComparisonReport | null,
  selectedReportCodeFilter: null as string | null,
  activeSnapshot: null as "design" | "page" | null,
  comparisonFeedback: [] as ComparisonFeedbackRecord[],
  issueStatuses: [] as ComparisonIssueStatusRecord[],
  feedbackDraft: {
    rating: 4,
    sentiment: "positive" as "positive" | "neutral" | "negative",
    notes: "",
    tags: "",
  },
  webhooks: [] as WebhookRecord[],
  selectedWebhook: null as WebhookRecord | null,
  webhookDeliveries: [] as WebhookDeliveryRecord[],
  billingActionMessage: null as string | null,
  webhookDraft: {
    name: localStorage.getItem("d2p-webhook-name") ?? "",
    targetUrl: localStorage.getItem("d2p-webhook-target-url") ?? "",
    comparisonCreated: localStorage.getItem("d2p-webhook-comparison-created") !== "false",
    comparisonFailed: localStorage.getItem("d2p-webhook-comparison-failed") === "true",
  },
  status: "Ready",
};

app.innerHTML = `
  <div class="app-shell" data-route="${getCurrentRoute()}">
    <div class="page-shell">
      <header class="topnav">
        <div class="topnav__left">
          <div class="topnav__brand">
            <div class="sidebar__mark">DQ</div>
            <strong>Design QA Cockpit</strong>
          </div>
          <label class="topnav__select">
            <span>Project</span>
            <select id="project"></select>
          </label>
        </div>
        <div class="topnav__right">
          <span class="env-badge">Production</span>
          <button class="icon-button" type="button" aria-label="Notifications">
            <span class="icon-bell"></span>
            <span id="announcement-count" class="pill pill--warn">0 unread</span>
          </button>
          <button id="open-settings" class="icon-button icon-button--profile" type="button" aria-label="Open settings">
            AT
          </button>
        </div>
      </header>

      <main class="dashboard-grid">
        <section class="hero hero--dashboard">
          <div class="hero__copy">
            <div class="eyebrow">Design QA cockpit</div>
            <h1>Compare Figma designs with production pages</h1>
            <p>Detect layout, spacing, typography, and missing elements before release.</p>
            <div class="hero__actions">
              <button id="run-qa-check-setup" class="button">Run QA Check</button>
              <button id="load-session" class="button button--ghost">Load Session</button>
            </div>
          </div>
          <div class="hero__visual">
            <div class="hero__visual-head">
              <span class="pill pill--pass" id="latest-run-status">Latest run</span>
              <span class="muted">Completed</span>
            </div>
            <div class="latest-run-card">
              <div class="latest-run-card__ring">
                <svg viewBox="0 0 120 120" class="score-ring" aria-label="Overall score 87 percent">
                  <circle cx="60" cy="60" r="46"></circle>
                  <circle cx="60" cy="60" r="46" class="score-ring__value"></circle>
                </svg>
                <div class="score-ring__label">
                  <strong id="latest-score-value">87%</strong>
                  <span>Overall score</span>
                </div>
              </div>
              <dl class="latest-run-card__meta">
                <div><dt>Passed</dt><dd id="latest-passed">124</dd></div>
                <div><dt>Warnings</dt><dd id="latest-warnings">18</dd></div>
                <div><dt>Failed</dt><dd id="latest-failed">7</dd></div>
                <div><dt>Runtime</dt><dd id="latest-runtime">2m 42s</dd></div>
                <div><dt>Threshold</dt><dd id="latest-threshold">90%</dd></div>
              </dl>
            </div>
          </div>
        </section>

        <section class="run-config">
          <div class="section__head section__head--compact">
            <div>
              <h2>Run QA Check</h2>
              <p class="muted">Paste the Figma design URL and live page URL, then run the comparison.</p>
            </div>
          </div>
          <div id="run-status" class="run-status" role="status" aria-live="polite">Ready</div>
          <div id="run-error-panel" class="run-error-panel" hidden>
            <div class="run-error-panel__head">
              <strong>Figma connection error</strong>
              <span class="pill pill--danger" id="run-error-code">Attention needed</span>
            </div>
            <div id="run-error-message" class="run-error-panel__message"></div>
            <div id="run-error-hint" class="run-error-panel__hint"></div>
          </div>
          <div class="toolbar">
            <div class="field field--wide">
              <label>Figma Design URL</label>
              <input
                id="figma-design-url"
                type="url"
                value="${state.figmaDesignUrl}"
                placeholder="https://www.figma.com/design/ABC123/Marketing-Website"
              />
            </div>
            <div class="field field--wide">
              <label>Live Page URL</label>
              <input id="live-page-url" type="url" value="${state.appUrl}" placeholder="https://example.com" />
            </div>
            <div class="field field--narrow">
              <label>Viewport</label>
              <select id="device-preset">
                <option value="desktop">Desktop</option>
                <option value="tablet">Tablet</option>
                <option value="mobile">Mobile</option>
              </select>
            </div>
            <div class="field field--narrow">
              <label>Tolerance</label>
              <input id="limit" type="number" min="1" max="100" value="${state.limit}" />
            </div>
            <div class="toolbar__actions">
              <button id="run-qa-check" class="button">Run QA Check</button>
              <button id="download-report" class="button button--ghost">Download Report</button>
            </div>
            <details class="advanced-settings">
              <summary>Developer Options</summary>
              <div class="advanced-settings__grid">
                <div class="field field--wide">
                  <label>API URL</label>
                  <input id="api-base-url" type="url" value="${state.apiBaseUrl}" />
                </div>
                <div class="field field--wide">
                  <label>JWT</label>
                  <input id="jwt" type="password" value="${state.jwt}" placeholder="Bearer token" />
                </div>
                <div class="field">
                  <label>Figma file</label>
                  <select id="figma-file"></select>
                </div>
                <div class="field field--narrow">
                  <label>Status</label>
                  <select id="status-filter">
                    <option value="all">All</option>
                    <option value="pass">Pass</option>
                    <option value="warn">Warn</option>
                    <option value="fail">Fail</option>
                  </select>
                </div>
                <div class="field field--narrow">
                  <label>Scale</label>
                  <input id="device-scale-factor" type="number" min="1" max="4" step="0.25" value="${state.deviceScaleFactor}" />
                </div>
                <div class="field field--narrow">
                  <label>Width</label>
                  <input id="viewport-width" type="number" min="320" max="4000" value="${state.viewportWidth}" />
                </div>
                <div class="field field--narrow">
                  <label>Height</label>
                  <input id="viewport-height" type="number" min="240" max="4000" value="${state.viewportHeight}" />
                </div>
                <div class="field field--wide">
                  <label>User agent</label>
                  <input id="user-agent" type="text" value="${state.userAgent}" />
                </div>
                <div class="field field--wide">
                  <label>Actions</label>
                  <div class="toolbar__actions toolbar__actions--advanced">
                    <button id="export-json" class="button button--ghost" type="button">Developer Export</button>
                    <button id="load-history" class="button button--ghost" type="button">Load History</button>
                    <button id="refresh" class="button button--ghost" type="button">Refresh Detail</button>
                    <button id="download-report-csv" class="button button--ghost" type="button">Download CSV</button>
                    <button id="download-report-pdf" class="button button--ghost" type="button">Download PDF</button>
                  </div>
                </div>
              </div>
            </details>
          </div>
        </section>

        <section class="summary summary--top">
          <div id="summary"></div>
        </section>

        <section class="workspace-shell">
          <aside class="runs-drawer">
            <div class="section__head section__head--compact runs-drawer__head">
              <div>
                <h3>Recent Runs</h3>
                <p id="session-label" class="muted">Latest comparisons and score trend.</p>
              </div>
              <div id="status" class="status">Ready</div>
            </div>
            <div id="history-list" class="runs-drawer__content"></div>
          </aside>
          <section class="workspace-main">
            <div class="workspace-main__header">
              <h2>Run details</h2>
              <p id="detail-label" class="muted">Select a run to inspect it.</p>
            </div>
            <div id="detail" class="detail"></div>
          </section>
        </section>
      </main>

      <section class="settings-panel">
        <div class="settings-panel__head">
          <div>
            <div class="eyebrow">Developer options</div>
            <h2>Settings</h2>
            <p class="muted">Billing, tuning, announcements, release notes, webhooks, and maintenance live here.</p>
          </div>
          <div class="status">Hidden from dashboard</div>
        </div>

        <section class="section admin-section">
          <div class="section__head">
            <div>
              <h2>Billing</h2>
              <p class="muted">Plan details and subscription actions for the current tenant.</p>
            </div>
            <button id="refresh-billing" class="button button--ghost">Refresh</button>
          </div>
          <div id="billing" class="billing"></div>
          <div class="billing-actions">
            <button id="start-checkout" class="button">Start checkout</button>
            <button id="open-portal" class="button button--ghost">Open billing portal</button>
          </div>
        </section>

        <section class="section admin-section">
          <div class="section__head">
            <div>
              <h2>Tuning</h2>
              <p class="muted">Feedback-derived default tolerance for new comparisons.</p>
            </div>
            <button id="refresh-tuning" class="button button--ghost">Refresh</button>
          </div>
          <div id="tuning" class="tuning"></div>
        </section>

        <section class="section admin-section">
          <div class="section__head">
            <div>
              <h2>Announcements</h2>
              <p class="muted">Unread release and maintenance updates for the current session.</p>
            </div>
            <div class="section__head-actions">
              <span class="pill pill--warn" data-legacy-announcement-count>0 unread</span>
              <button id="refresh-announcements" class="button button--ghost">Refresh</button>
            </div>
          </div>
          <div id="announcements" class="announcements"></div>
        </section>

        <section class="section admin-section">
          <div class="section__head">
            <div>
              <h2>Release notes</h2>
              <p class="muted">Current release and recent maintenance updates.</p>
            </div>
            <button id="refresh-releases" class="button button--ghost">Refresh</button>
          </div>
          <div id="releases" class="releases"></div>
          <div class="release-management">
            <form id="release-form" class="management-form">
              <div class="field field--narrow">
                <label>Version</label>
                <input id="release-version" type="text" value="${state.releaseDraft.version}" placeholder="0.1.1" />
              </div>
              <div class="field field--wide">
                <label>Title</label>
                <input id="release-title" type="text" value="${state.releaseDraft.title}" placeholder="Maintenance update" />
              </div>
              <div class="field field--wide">
                <label>Summary</label>
                <textarea id="release-summary" rows="3" placeholder="What changed?">${state.releaseDraft.summary}</textarea>
              </div>
              <div class="field field--wide">
                <label>Highlights</label>
                <textarea id="release-highlights" rows="3" placeholder="One highlight per line">${state.releaseDraft.highlights}</textarea>
              </div>
              <button class="button" type="submit">Publish release note</button>
            </form>
            <form id="maintenance-form" class="management-form">
              <div class="field field--wide">
                <label>Maintenance message</label>
                <textarea id="maintenance-message" rows="4" placeholder="Planned maintenance window">${state.maintenanceDraft.message}</textarea>
              </div>
              <button class="button button--ghost" type="submit">Set maintenance message</button>
            </form>
          </div>
        </section>

        <section class="section admin-section">
          <div class="section__head">
            <div>
              <h2>Webhooks</h2>
              <p class="muted">Manage comparison delivery subscriptions for the current tenant.</p>
            </div>
            <button id="refresh-webhooks" class="button button--ghost">Refresh</button>
          </div>
          <div class="webhook-form">
            <div class="field">
              <label>Name</label>
              <input id="webhook-name" type="text" value="${state.webhookDraft.name}" placeholder="CI notifications" />
            </div>
            <div class="field field--wide">
              <label>Target URL</label>
              <input id="webhook-target-url" type="url" value="${state.webhookDraft.targetUrl}" placeholder="http://localhost:4000/webhook" />
            </div>
            <label class="check">
              <input id="webhook-event-created" type="checkbox" ${state.webhookDraft.comparisonCreated ? "checked" : ""} />
              <span>comparison.created</span>
            </label>
            <label class="check">
              <input id="webhook-event-failed" type="checkbox" ${state.webhookDraft.comparisonFailed ? "checked" : ""} />
              <span>comparison.failed</span>
            </label>
            <button id="create-webhook" class="button">Create webhook</button>
          </div>
          <div id="webhook-list" class="webhook-list"></div>
          <div id="webhook-deliveries" class="webhook-deliveries"></div>
        </section>
      </section>
    </div>
  </div>
`;const apiBaseInput = getRequiredElement<HTMLInputElement>("api-base-url");
const livePageUrlInput = getRequiredElement<HTMLInputElement>("live-page-url");
const figmaDesignUrlInput = getRequiredElement<HTMLInputElement>("figma-design-url");
const jwtInput = getRequiredElement<HTMLInputElement>("jwt");
const projectSelect = getRequiredElement<HTMLSelectElement>("project");
const fileSelect = getRequiredElement<HTMLSelectElement>("figma-file");
const limitInput = getRequiredElement<HTMLInputElement>("limit");
const statusFilterSelect = getRequiredElement<HTMLSelectElement>("status-filter");
const devicePresetSelect = getRequiredElement<HTMLSelectElement>("device-preset");
const viewportWidthInput = getRequiredElement<HTMLInputElement>("viewport-width");
const viewportHeightInput = getRequiredElement<HTMLInputElement>("viewport-height");
const deviceScaleFactorInput = getRequiredElement<HTMLInputElement>("device-scale-factor");
const userAgentInput = getRequiredElement<HTMLInputElement>("user-agent");
const historyList = getRequiredElement<HTMLDivElement>("history-list");
const summary = getRequiredElement<HTMLDivElement>("summary");
const billing = getRequiredElement<HTMLDivElement>("billing");
const tuning = getRequiredElement<HTMLDivElement>("tuning");
const announcements = getRequiredElement<HTMLDivElement>("announcements");
const announcementCount = getRequiredElement<HTMLSpanElement>("announcement-count");
const releases = getRequiredElement<HTMLDivElement>("releases");
const detail = getRequiredElement<HTMLDivElement>("detail");
const webhookList = getRequiredElement<HTMLDivElement>("webhook-list");
const webhookDeliveries = getRequiredElement<HTMLDivElement>("webhook-deliveries");
const detailLabel = getRequiredElement<HTMLParagraphElement>("detail-label");
const sessionLabel = getRequiredElement<HTMLParagraphElement>("session-label");
const statusLabel = getRequiredElement<HTMLDivElement>("status");
const runStatusBanner = getRequiredElement<HTMLDivElement>("run-status");
const runErrorPanel = getRequiredElement<HTMLDivElement>("run-error-panel");
const runErrorCode = getRequiredElement<HTMLSpanElement>("run-error-code");
const runErrorMessage = getRequiredElement<HTMLDivElement>("run-error-message");
const runErrorHint = getRequiredElement<HTMLDivElement>("run-error-hint");
const runComparisonButton = getRequiredElement<HTMLButtonElement>("run-qa-check");
const loadHistoryButton = getRequiredElement<HTMLButtonElement>("load-history");
const refreshButton = getRequiredElement<HTMLButtonElement>("refresh");
const exportJsonButton = getRequiredElement<HTMLButtonElement>("export-json");
const downloadReportButton = getRequiredElement<HTMLButtonElement>("download-report");
const downloadReportCsvButton = getRequiredElement<HTMLButtonElement>("download-report-csv");
const downloadReportPdfButton = getRequiredElement<HTMLButtonElement>("download-report-pdf");
const refreshWebhooksButton = getRequiredElement<HTMLButtonElement>("refresh-webhooks");
const refreshBillingButton = getRequiredElement<HTMLButtonElement>("refresh-billing");
const refreshTuningButton = getRequiredElement<HTMLButtonElement>("refresh-tuning");
const refreshAnnouncementsButton = getRequiredElement<HTMLButtonElement>("refresh-announcements");
const refreshReleasesButton = getRequiredElement<HTMLButtonElement>("refresh-releases");
const startCheckoutButton = getRequiredElement<HTMLButtonElement>("start-checkout");
const releaseForm = getRequiredElement<HTMLFormElement>("release-form");
const releaseVersionInput = getRequiredElement<HTMLInputElement>("release-version");
const releaseTitleInput = getRequiredElement<HTMLInputElement>("release-title");
const releaseSummaryInput = getRequiredElement<HTMLTextAreaElement>("release-summary");
const releaseHighlightsInput = getRequiredElement<HTMLTextAreaElement>("release-highlights");
const maintenanceForm = getRequiredElement<HTMLFormElement>("maintenance-form");
const maintenanceMessageInput = getRequiredElement<HTMLTextAreaElement>("maintenance-message");
const openPortalButton = getRequiredElement<HTMLButtonElement>("open-portal");
const createWebhookButton = getRequiredElement<HTMLButtonElement>("create-webhook");
const webhookNameInput = getRequiredElement<HTMLInputElement>("webhook-name");
const webhookTargetUrlInput = getRequiredElement<HTMLInputElement>("webhook-target-url");
const webhookEventCreatedInput = getRequiredElement<HTMLInputElement>("webhook-event-created");
const webhookEventFailedInput = getRequiredElement<HTMLInputElement>("webhook-event-failed");
const openSettingsButton = getRequiredElement<HTMLButtonElement>("open-settings");
const runComparisonSetupButton = getRequiredElement<HTMLButtonElement>("run-qa-check-setup");

statusFilterSelect.value = state.statusFilter;
devicePresetSelect.value = state.devicePreset;

bindPersistedInput(apiBaseInput, "d2p-api-base-url");
bindPersistedInput(livePageUrlInput, "d2p-live-page-url");
bindPersistedInput(figmaDesignUrlInput, "d2p-figma-design-url");
bindPersistedInput(jwtInput, "auth_token");
bindPersistedInput(limitInput, "d2p-limit");
bindPersistedInput(viewportWidthInput, "d2p-viewport-width");
bindPersistedInput(viewportHeightInput, "d2p-viewport-height");
bindPersistedInput(deviceScaleFactorInput, "d2p-device-scale-factor");
bindPersistedInput(userAgentInput, "d2p-user-agent");
bindPersistedInput(webhookNameInput, "d2p-webhook-name");
bindPersistedInput(webhookTargetUrlInput, "d2p-webhook-target-url");

projectSelect.addEventListener("change", () => {
  localStorage.setItem("d2p-project-id", projectSelect.value);
  state.projectId = projectSelect.value;
  populateFileOptions();
  persistSelectedFile();
});

document.querySelectorAll<HTMLElement>("[data-nav]").forEach((item) => {
  item.addEventListener("click", () => {
    const target = item.dataset.nav;
    if (target === "settings") {
      location.hash = "#settings";
    } else {
      location.hash = "";
    }
  });
});

openSettingsButton.addEventListener("click", () => {
  location.hash = "#settings";
});

fileSelect.addEventListener("change", () => {
  state.figmaFileId = fileSelect.value;
  persistSelectedFile();
});

statusFilterSelect.addEventListener("change", () => {
  state.statusFilter = statusFilterSelect.value as StatusFilter;
  localStorage.setItem("d2p-status-filter", state.statusFilter);
  renderHistory();
  renderSummary();
});

runComparisonButton.addEventListener("click", async () => {
  await runComparison();
});

runComparisonSetupButton.addEventListener("click", async () => {
  await runComparison();
});

loadHistoryButton.addEventListener("click", async () => {
  await loadHistory();
});

refreshButton.addEventListener("click", async () => {
  await loadHistory();
});

devicePresetSelect.addEventListener("change", () => {
  state.devicePreset = devicePresetSelect.value as DevicePreset;
  applyDevicePreset(state.devicePreset);
  persistCaptureSettings();
});

viewportWidthInput.addEventListener("change", () => {
  state.viewportWidth = Number(viewportWidthInput.value) || state.viewportWidth;
  persistCaptureSettings();
});

viewportHeightInput.addEventListener("change", () => {
  state.viewportHeight = Number(viewportHeightInput.value) || state.viewportHeight;
  persistCaptureSettings();
});

deviceScaleFactorInput.addEventListener("change", () => {
  state.deviceScaleFactor = Number(deviceScaleFactorInput.value) || state.deviceScaleFactor;
  persistCaptureSettings();
});

userAgentInput.addEventListener("change", () => {
  state.userAgent = userAgentInput.value.trim() || state.userAgent;
  persistCaptureSettings();
});

exportJsonButton.addEventListener("click", () => {
  const payload = JSON.stringify(filteredHistory(), null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `comparison-history-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  setStatus("Exported JSON");
});

downloadReportButton.addEventListener("click", async () => {
  if (!state.selectedRun) {
    setStatus("Select a run first");
    return;
  }

  await loadReport(state.selectedRun.id, "json");
});

downloadReportCsvButton.addEventListener("click", async () => {
  if (!state.selectedRun) {
    setStatus("Select a run first");
    return;
  }

  await loadReport(state.selectedRun.id, "csv");
});

downloadReportPdfButton.addEventListener("click", async () => {
  if (!state.selectedRun) {
    setStatus("Select a run first");
    return;
  }

  await loadReport(state.selectedRun.id, "pdf");
});

refreshWebhooksButton.addEventListener("click", async () => {
  await loadWebhooks();
});

refreshBillingButton.addEventListener("click", async () => {
  await loadBilling();
});

refreshTuningButton.addEventListener("click", async () => {
  await loadTuning();
});

refreshAnnouncementsButton.addEventListener("click", async () => {
  await loadAnnouncements();
});

refreshReleasesButton.addEventListener("click", async () => {
  await loadReleases();
});

releaseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await publishReleaseNote();
});

maintenanceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await publishMaintenanceMessage();
});

startCheckoutButton.addEventListener("click", async () => {
  await startCheckout();
});

openPortalButton.addEventListener("click", async () => {
  await openBillingPortal();
});

createWebhookButton.addEventListener("click", async () => {
  await createWebhook();
});

announcements.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const button = target.closest<HTMLButtonElement>("[data-ack-announcement]");
  if (!button) {
    return;
  }

  const announcementId = Number(button.dataset.ackAnnouncement);
  if (!Number.isInteger(announcementId) || announcementId <= 0) {
    return;
  }

  await acknowledgeAnnouncement(announcementId);
});

webhookEventCreatedInput.addEventListener("change", () => {
  state.webhookDraft.comparisonCreated = webhookEventCreatedInput.checked;
  localStorage.setItem("d2p-webhook-comparison-created", String(state.webhookDraft.comparisonCreated));
});

webhookEventFailedInput.addEventListener("change", () => {
  state.webhookDraft.comparisonFailed = webhookEventFailedInput.checked;
  localStorage.setItem("d2p-webhook-comparison-failed", String(state.webhookDraft.comparisonFailed));
});

projectSelect.addEventListener("change", async () => {
  if (projectSelect.value) {
    await loadHistory();
  }
});

function syncRoute(): void {
  const route = getCurrentRoute();
  app.dataset.route = route;

  document.querySelectorAll<HTMLElement>("[data-nav]").forEach((item) => {
    const navRoute = item.dataset.nav;
    item.classList.toggle("sidebar__item--active", navRoute === route || (route === "dashboard" && navRoute === "dashboard"));
  });
}

window.addEventListener("hashchange", syncRoute);

syncRoute();
renderSummary();
renderBilling();
renderTuning();
renderAnnouncements();
renderReleases();
renderWebhooks();
renderHistory();
renderEmptyDetail();

  void loadReleases();

  if (jwtInput.value.trim()) {
    void loadSession();
  } else {
    void loadDemoData();
  }

async function loadSession(): Promise<void> {
  setStatus("Loading session...");
  try {
    const session = await requestJson<{
      ok: true;
      context: SessionContext;
    }>("/v1/session-context");
    state.session = session.context;
    sessionLabel.textContent = `Tenant ${session.context.tenantId} - ${session.context.projects.length} project(s)`;

    const options = session.context.projects
      .map((project) => `<option value="${project.externalId}">${labelForProject(project)}</option>`)
      .join("");

    projectSelect.innerHTML = options || `<option value="">No projects available</option>`;
    projectSelect.value = state.projectId && hasProject(state.projectId) ? state.projectId : projectSelect.value;
    state.projectId = projectSelect.value;
    localStorage.setItem("d2p-project-id", state.projectId);
    populateFileOptions();

    const sectionLoads = [
      loadTenantUsage(session.context.tenantId),
      loadBilling(),
      loadTuning(),
      loadAnnouncements(),
      loadReleases(),
      loadWebhooks(),
      loadHistory(),
    ];

    const results = await Promise.allSettled(sectionLoads);
    const failed = results.find((result) => result.status === "rejected") as PromiseRejectedResult | undefined;

    if (failed) {
      setStatus(errorMessage(failed.reason));
    } else {
      setStatus("Session loaded");
    }
  } catch (error) {
    setStatus(errorMessage(error));
    renderEmptyDetail();
  }
}

async function loadDemoData(): Promise<void> {
  setStatus("Loading demo data...");

  try {
    apiBaseInput.value = "http://127.0.0.1:3001";
    state.apiBaseUrl = apiBaseInput.value;
    localStorage.setItem("d2p-api-base-url", state.apiBaseUrl);

    const response = await fetch(`${apiBaseInput.value.replace(/\/$/, "")}/v1/dev/demo-seed`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.message ?? `Request failed: ${response.status}`);
    }

    const seed = (await response.json()) as DemoSeedResponse;

    jwtInput.value = seed.token;
    localStorage.setItem("auth_token", seed.token);
    localStorage.setItem("d2p-project-id", seed.projectId);
    localStorage.setItem("d2p-figma-file-id", seed.figmaFileId);
    figmaDesignUrlInput.value = "https://www.figma.com/design/ABC123/Marketing-Website";
    livePageUrlInput.value = "http://localhost:3000";
    localStorage.setItem("d2p-figma-design-url", figmaDesignUrlInput.value);
    localStorage.setItem("d2p-live-page-url", livePageUrlInput.value);
    state.figmaDesignUrl = figmaDesignUrlInput.value;
    state.appUrl = livePageUrlInput.value;
    state.projectId = seed.projectId;
    state.figmaFileId = seed.figmaFileId;

    await loadSession();
    setStatus(`Demo loaded: run #${seed.comparisonRunId} (${seed.comparisonStatus})`);
  } catch (error) {
    setStatus(errorMessage(error));
  }
}

async function runComparison(): Promise<void> {
  if (!jwtInput.value.trim() || !state.session) {
    setStatus("Load session first");
    return;
  }

  const figmaUrl = figmaDesignUrlInput.value.trim();
  const pageUrl = livePageUrlInput.value.trim();

  if (!figmaUrl) {
    setStatus("Figma Design URL is required");
    return;
  }

  if (!pageUrl) {
    setStatus("Live Page URL is required");
    return;
  }

  try {
    parseFigmaDesignUrl(figmaUrl);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Invalid Figma URL. Please paste a valid design link.");
    return;
  }

  if (isLocalUrl(pageUrl) && !["localhost", "127.0.0.1"].includes(location.hostname)) {
    setStatus("Local URLs may not work in production. Use a staging or public URL.");
    return;
  }

  const tenantId = state.session.tenantId;
  const projectId = projectSelect.value || state.projectId;

  localStorage.setItem("d2p-figma-design-url", figmaUrl);
  localStorage.setItem("d2p-live-page-url", pageUrl);

  setStatus("Running QA check...");
  try {
    const response = await requestJson<QaCheckResponse>("/v1/qa/check", {
      method: "POST",
      body: JSON.stringify({
        tenantId,
        projectId,
        figmaUrl,
        pageUrl,
        viewport: state.devicePreset,
        tolerancePx: Number(limitInput.value) || undefined,
      }),
    });

    await loadHistory();
    await selectRun(response.storedComparison.id);
    setStatus(`QA check run #${response.storedComparison.id} (${response.storedComparison.status})`);
  } catch (error) {
    setStatus(errorMessage(error));
  }
}

async function loadHistory(): Promise<void> {
  if (!jwtInput.value.trim()) {
    setStatus("JWT is required");
    return;
  }

  setStatus("Loading history...");
  try {
    const query = new URLSearchParams();
    if (projectSelect.value) {
      query.set("projectId", projectSelect.value);
    }
    if (fileSelect.value) {
      query.set("figmaFileId", fileSelect.value);
    }
    query.set("limit", String(Number(limitInput.value) || 20));

    const response = await requestJson<{
      ok: true;
      history: ComparisonHistoryItem[];
    }>(`/v1/comparisons?${query.toString()}`);

    state.history = response.history;
    renderSummary();
    renderHistory();
    setStatus(`Loaded ${response.history.length} run(s)`);

    if (filteredHistory().length > 0) {
      await selectRun(filteredHistory()[0].id);
    } else {
      renderEmptyDetail();
    }
  } catch (error) {
    setStatus(errorMessage(error));
    renderEmptyDetail();
  }
}

async function loadTenantUsage(tenantId: string): Promise<void> {
  if (!jwtInput.value.trim()) {
    return;
  }

  const response = await requestJson<TenantUsageResponse>(`/v1/tenants/${encodeURIComponent(tenantId)}/usage`);
  state.usage = response;
  renderSummary();
}

async function loadBilling(): Promise<void> {
  if (!jwtInput.value.trim() || !state.session) {
    return;
  }

  const response = await requestJson<TenantBillingResponse>(`/v1/billing/${encodeURIComponent(state.session.tenantId)}`);
  state.billing = response;
  renderBilling();
}

async function loadTuning(): Promise<void> {
  if (!jwtInput.value.trim() || !state.session) {
    return;
  }

  const response = await requestJson<TenantTuningResponse>(`/v1/tenants/${encodeURIComponent(state.session.tenantId)}/tuning`);
  state.tuning = response;
  renderTuning();
}

async function loadAnnouncements(): Promise<void> {
  if (!jwtInput.value.trim() || !state.session) {
    return;
  }

  const response = await requestJson<AnnouncementsResponse>("/v1/announcements");
  state.announcements = response.announcements;
  state.unreadAnnouncementCount = response.unreadCount;
  renderAnnouncements();
}

async function loadReleases(): Promise<void> {
  const response = await requestJson<ReleasesResponse>("/v1/releases");
  state.releases = response.releases;
  const latest = await requestJson<LatestReleaseResponse>("/v1/releases/latest");
  state.latestRelease = latest;
  renderReleases();
}

async function acknowledgeAnnouncement(announcementId: number): Promise<void> {
  if (!jwtInput.value.trim() || !state.session) {
    setStatus("Load session first");
    return;
  }

  setStatus("Acknowledging announcement...");
  try {
    const response = await requestJson<AnnouncementAckResponse>(`/v1/announcements/${announcementId}/ack`, {
      method: "POST",
    });

    state.unreadAnnouncementCount = response.unreadCount;
    state.announcements = state.announcements.map((announcement) =>
      announcement.id === announcementId ? response.announcement : announcement
    );
    renderAnnouncements();
    setStatus("Announcement acknowledged");
  } catch (error) {
    setStatus(errorMessage(error));
  }
}

async function publishReleaseNote(): Promise<void> {
  if (!jwtInput.value.trim() || !state.session) {
    setStatus("Load session first");
    return;
  }

  const highlights = releaseHighlightsInput.value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

  localStorage.setItem("d2p-release-version", releaseVersionInput.value);
  localStorage.setItem("d2p-release-title", releaseTitleInput.value);
  localStorage.setItem("d2p-release-summary", releaseSummaryInput.value);
  localStorage.setItem("d2p-release-highlights", releaseHighlightsInput.value);

  setStatus("Publishing release note...");
  try {
    await requestJson<{ ok: true; release: ReleaseNote }>(
      `/v1/tenants/${encodeURIComponent(state.session.tenantId)}/releases`,
      {
        method: "POST",
        body: JSON.stringify({
          version: releaseVersionInput.value,
          title: releaseTitleInput.value,
          summary: releaseSummaryInput.value,
          highlights,
        }),
      }
    );

    await loadReleases();
    setStatus("Release note published");
  } catch (error) {
    setStatus(errorMessage(error));
  }
}

async function publishMaintenanceMessage(): Promise<void> {
  if (!jwtInput.value.trim() || !state.session) {
    setStatus("Load session first");
    return;
  }

  localStorage.setItem("d2p-maintenance-message", maintenanceMessageInput.value);

  setStatus("Updating maintenance message...");
  try {
    await requestJson<{ ok: true; message: string }>(
      `/v1/tenants/${encodeURIComponent(state.session.tenantId)}/maintenance`,
      {
        method: "POST",
        body: JSON.stringify({
          message: maintenanceMessageInput.value,
        }),
      }
    );

    await loadReleases();
    setStatus("Maintenance message updated");
  } catch (error) {
    setStatus(errorMessage(error));
  }
}

async function startCheckout(): Promise<void> {
  if (!jwtInput.value.trim() || !state.session) {
    setStatus("Load session first");
    return;
  }

  setStatus("Starting checkout...");
  try {
    const response = await requestJson<BillingActionResponse>(
      `/v1/billing/${encodeURIComponent(state.session.tenantId)}/checkout-session`,
      { method: "POST" }
    );

    state.billing = { ok: true, billing: response.billing };
    state.billingActionMessage = response.action.message;
    renderBilling();

    if (response.action.url) {
      window.open(response.action.url, "_blank", "noopener,noreferrer");
    }

    setStatus(response.action.message);
  } catch (error) {
    setStatus(errorMessage(error));
  }
}

async function openBillingPortal(): Promise<void> {
  if (!jwtInput.value.trim() || !state.session) {
    setStatus("Load session first");
    return;
  }

  setStatus("Opening billing portal...");
  try {
    const response = await requestJson<BillingActionResponse>(
      `/v1/billing/${encodeURIComponent(state.session.tenantId)}/portal-session`,
      { method: "POST" }
    );

    state.billing = { ok: true, billing: response.billing };
    state.billingActionMessage = response.action.message;
    renderBilling();

    if (response.action.url) {
      window.open(response.action.url, "_blank", "noopener,noreferrer");
    }

    setStatus(response.action.message);
  } catch (error) {
    setStatus(errorMessage(error));
  }
}

async function loadWebhooks(): Promise<void> {
  if (!jwtInput.value.trim()) {
    return;
  }

  try {
    const response = await requestJson<{
      ok: true;
      webhooks: WebhookRecord[];
    }>("/v1/integrations/webhooks");

    state.webhooks = response.webhooks;
    renderWebhooks();

    if (state.selectedWebhook) {
      const stillPresent = state.webhooks.find((webhook) => webhook.id === state.selectedWebhook?.id) ?? null;
      state.selectedWebhook = stillPresent;
      if (stillPresent) {
        await loadWebhookDeliveries(stillPresent.id);
      } else {
        state.webhookDeliveries = [];
        renderWebhookDeliveries();
      }
    }
  } catch (error) {
    setStatus(errorMessage(error));
  }
}

async function createWebhook(): Promise<void> {
  if (!jwtInput.value.trim()) {
    setStatus("JWT is required");
    return;
  }

  const events: Array<"comparison.created" | "comparison.failed"> = [];
  if (webhookEventCreatedInput.checked) {
    events.push("comparison.created");
  }
  if (webhookEventFailedInput.checked) {
    events.push("comparison.failed");
  }

  if (!webhookNameInput.value.trim() || !webhookTargetUrlInput.value.trim()) {
    setStatus("Webhook name and target URL are required");
    return;
  }

  if (events.length === 0) {
    setStatus("Select at least one webhook event");
    return;
  }

  localStorage.setItem("d2p-webhook-name", webhookNameInput.value.trim());
  localStorage.setItem("d2p-webhook-target-url", webhookTargetUrlInput.value.trim());

  setStatus("Creating webhook...");
  try {
    await requestJson<{
      ok: true;
      webhook: WebhookRecord;
    }>("/v1/integrations/webhooks", {
      method: "POST",
      body: JSON.stringify({
        tenantId: state.session?.tenantId ?? "",
        name: webhookNameInput.value.trim(),
        targetUrl: webhookTargetUrlInput.value.trim(),
        events,
      }),
    });

    webhookNameInput.value = "";
    webhookTargetUrlInput.value = "";
    state.webhookDraft.name = "";
    state.webhookDraft.targetUrl = "";
    localStorage.setItem("d2p-webhook-name", "");
    localStorage.setItem("d2p-webhook-target-url", "");

    await loadWebhooks();
    setStatus("Webhook created");
  } catch (error) {
    setStatus(errorMessage(error));
  }
}

async function revokeWebhook(webhookId: number): Promise<void> {
  setStatus(`Revoking webhook ${webhookId}...`);
  try {
    await requestJson<{ ok: true }>(`/v1/integrations/webhooks/${webhookId}/revoke`, {
      method: "POST",
    });

    if (state.selectedWebhook?.id === webhookId) {
      state.selectedWebhook = null;
      state.webhookDeliveries = [];
      renderWebhookDeliveries();
    }

    await loadWebhooks();
    setStatus(`Revoked webhook ${webhookId}`);
  } catch (error) {
    setStatus(errorMessage(error));
  }
}

async function loadWebhookDeliveries(webhookId: number): Promise<void> {
  setStatus(`Loading webhook ${webhookId} deliveries...`);
  try {
    const response = await requestJson<{
      ok: true;
      webhook: WebhookRecord;
      deliveries: WebhookDeliveryRecord[];
    }>(`/v1/integrations/webhooks/${webhookId}/deliveries?limit=20`);

    state.selectedWebhook = response.webhook;
    state.webhookDeliveries = response.deliveries;
    renderWebhooks();
    renderWebhookDeliveries();
    setStatus(`Loaded webhook ${webhookId} deliveries`);
  } catch (error) {
    setStatus(errorMessage(error));
    state.webhookDeliveries = [];
    renderWebhookDeliveries();
  }
}

async function redeliverWebhookDelivery(webhookId: number, deliveryId: number): Promise<void> {
  setStatus(`Redelivering webhook ${webhookId} delivery ${deliveryId}...`);
  try {
    await requestJson<{ ok: true; delivery: WebhookDeliveryRecord }>(
      `/v1/integrations/webhooks/${webhookId}/deliveries/${deliveryId}/redeliver`,
      {
        method: "POST",
      }
    );

    await loadWebhookDeliveries(webhookId);
    setStatus(`Redelivered webhook ${webhookId} delivery ${deliveryId}`);
  } catch (error) {
    setStatus(errorMessage(error));
  }
}

function renderWebhooks(): void {
  if (state.webhooks.length === 0) {
    webhookList.innerHTML = `<div class="empty">No webhooks configured.</div>`;
    return;
  }

  webhookList.innerHTML = state.webhooks
    .map(
      (webhook) => `
        <div class="webhook-card ${state.selectedWebhook?.id === webhook.id ? "webhook-card--active" : ""}">
          <div class="webhook-card__head">
            <strong>${webhook.name}</strong>
            <span class="pill ${webhook.revokedAt ? "pill--warn" : "pill--pass"}">
              ${webhook.revokedAt ? "revoked" : "active"}
            </span>
          </div>
          <div class="webhook-card__meta">${webhook.targetUrl}</div>
          <div class="webhook-card__meta">Events: ${webhook.events.join(", ")}</div>
          <div class="webhook-card__meta">Created ${webhook.createdAt}</div>
          <div class="webhook-card__actions">
            <button class="linkish" type="button" data-webhook-action="deliveries" data-webhook-id="${webhook.id}">Deliveries</button>
            <button class="linkish" type="button" data-webhook-action="revoke" data-webhook-id="${webhook.id}" ${webhook.revokedAt ? "disabled" : ""}>Revoke</button>
          </div>
        </div>
      `
    )
    .join("");

  for (const button of Array.from(webhookList.querySelectorAll<HTMLButtonElement>("[data-webhook-action]"))) {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const webhookId = Number(button.dataset.webhookId);
      const action = button.dataset.webhookAction;

      if (!Number.isFinite(webhookId) || !action) {
        return;
      }

      if (action === "deliveries") {
        await loadWebhookDeliveries(webhookId);
      } else if (action === "revoke") {
        await revokeWebhook(webhookId);
      }
    });
  }

  for (const card of Array.from(webhookList.querySelectorAll<HTMLDivElement>(".webhook-card"))) {
    card.addEventListener("click", async () => {
      const button = card.querySelector<HTMLButtonElement>("[data-webhook-id]");
      const webhookId = Number(button?.dataset.webhookId);
      if (Number.isFinite(webhookId)) {
        await loadWebhookDeliveries(webhookId);
      }
    });
  }
}

function renderWebhookDeliveries(): void {
  const selectedWebhook = state.selectedWebhook;

  if (!selectedWebhook) {
    webhookDeliveries.innerHTML = `<div class="empty">Select a webhook to inspect deliveries.</div>`;
    return;
  }

  const deliveries = state.webhookDeliveries;

  webhookDeliveries.innerHTML = `
    <div class="section__head section__head--compact">
      <div>
        <h3>${selectedWebhook.name}</h3>
        <p class="muted">${selectedWebhook.targetUrl}</p>
      </div>
      <span class="pill ${selectedWebhook.revokedAt ? "pill--warn" : "pill--pass"}">
        ${selectedWebhook.revokedAt ? "revoked" : "active"}
      </span>
    </div>
    ${
      deliveries.length === 0
        ? `<div class="empty">No deliveries recorded.</div>`
        : deliveries
            .map(
              (delivery) => `
                <div class="delivery delivery--${delivery.status}">
                  <div class="delivery__head">
                    <strong>${delivery.eventType}</strong>
                    <span>${delivery.status}</span>
                  </div>
                  <div class="delivery__meta">Attempts: ${delivery.attemptCount} - Status: ${delivery.responseStatus ?? "n/a"}</div>
                  <div class="delivery__meta">Delivered ${delivery.deliveredAt}</div>
                  <div class="delivery__meta">${delivery.errorText ?? "No error"}</div>
                  <div class="webhook-card__actions">
                    <button class="linkish" type="button" data-delivery-action="redeliver" data-delivery-id="${delivery.id}" ${delivery.status === "delivered" ? "disabled" : ""}>Redeliver</button>
                  </div>
                </div>
              `
            )
            .join("")
    }
  `;

  for (const button of Array.from(webhookDeliveries.querySelectorAll<HTMLButtonElement>("[data-delivery-action]"))) {
    button.addEventListener("click", async () => {
      const deliveryId = Number(button.dataset.deliveryId);
      if (!Number.isFinite(deliveryId) || !state.selectedWebhook) {
        return;
      }

      await redeliverWebhookDelivery(state.selectedWebhook.id, deliveryId);
    });
  }
}

async function selectRun(id: number): Promise<void> {
  setStatus(`Loading run ${id}...`);
  try {
    const run = await requestJson<{ ok: true; run: ComparisonRunDetail }>(`/v1/comparisons/${id}`);
    state.selectedRun = run.run;
    state.selectedIssueKey = run.run.issues[0] ? issueKey(run.run.issues[0]) : null;
    state.hoveredIssueKey = null;
    state.selectedReport = null;
    state.selectedReportCodeFilter = null;
    state.comparisonFeedback = [];
    state.issueStatuses = [];
    renderDetail();
    await loadFeedback(id);
    await loadIssueStatuses(id);
    setStatus(`Loaded run ${id}`);
  } catch (error) {
    setStatus(errorMessage(error));
  }
}

function renderSummary(): void {
  const visibleHistory = filteredHistory();
  const latestRunStatus = document.getElementById("latest-run-status");
  if (latestRunStatus) {
    latestRunStatus.textContent = "Latest Run";
    latestRunStatus.className = "pill pill--pass";
  }

  const latestScoreValue = document.getElementById("latest-score-value");
  if (latestScoreValue) {
    latestScoreValue.textContent = "87%";
  }

  const latestPassed = document.getElementById("latest-passed");
  const latestWarnings = document.getElementById("latest-warnings");
  const latestFailed = document.getElementById("latest-failed");
  const latestRuntime = document.getElementById("latest-runtime");
  const latestThreshold = document.getElementById("latest-threshold");
  if (latestPassed) latestPassed.textContent = "124";
  if (latestWarnings) latestWarnings.textContent = "18";
  if (latestFailed) latestFailed.textContent = "7";
  if (latestRuntime) latestRuntime.textContent = "2m 42s";
  if (latestThreshold) latestThreshold.textContent = "90%";

  summary.innerHTML = `
    <div class="kpi-strip" aria-label="Comparison summary">
      <article class="kpi-card kpi-card--accent">
        <span class="kpi-card__label">Overall Score</span>
        <strong>87%</strong>
        <em>+4% vs last run</em>
      </article>
      <article class="kpi-card">
        <span class="kpi-card__label">Passed</span>
        <strong>124</strong>
        <em>18 components unchanged</em>
      </article>
      <article class="kpi-card">
        <span class="kpi-card__label">Warnings</span>
        <strong>18</strong>
        <em>Spacing drift detected</em>
      </article>
      <article class="kpi-card kpi-card--danger">
        <span class="kpi-card__label">Failed</span>
        <strong>7</strong>
        <em>Critical mismatch items</em>
      </article>
      <article class="kpi-card">
        <span class="kpi-card__label">Runtime</span>
        <strong>2m 42s</strong>
        <em>Browser capture included</em>
      </article>
      <article class="kpi-card">
        <span class="kpi-card__label">Threshold</span>
        <strong>90%</strong>
        <em>Tolerance gate</em>
      </article>
    </div>
  `;
}

function renderBilling(): void {
  const record = state.billing?.billing;

  if (!record) {
    billing.innerHTML = `<div class="empty">Load session to view billing details.</div>`;
    return;
  }

  billing.innerHTML = `
    <div class="billing-grid">
      <div class="summary-card"><span>Plan</span><strong>${record.planName}</strong></div>
      <div class="summary-card"><span>Status</span><strong>${record.planStatus}</strong></div>
      <div class="summary-card"><span>Provider</span><strong>${record.billingProvider}</strong></div>
      <div class="summary-card"><span>Customer</span><strong>${record.billingCustomerId ?? "Unset"}</strong></div>
      <div class="summary-card"><span>API keys</span><strong>${record.apiKeyCount}</strong></div>
    </div>
    <p class="muted">${state.billingActionMessage ?? "Use the checkout or portal actions to continue."}</p>
  `;
}

function renderTuning(): void {
  const record = state.tuning?.tuning;

  if (!record) {
    tuning.innerHTML = `<div class="empty">Load session to view tuning recommendations.</div>`;
    return;
  }

  tuning.innerHTML = `
    <div class="summary-grid summary-grid--usage">
      <div class="summary-card"><span>Feedback</span><strong>${record.feedbackCount}</strong></div>
      <div class="summary-card"><span>Avg rating</span><strong>${record.averageRating.toFixed(2)}</strong></div>
      <div class="summary-card"><span>Positive</span><strong>${record.positiveCount}</strong></div>
      <div class="summary-card"><span>Negative</span><strong>${record.negativeCount}</strong></div>
      <div class="summary-card"><span>Recommended tolerance</span><strong>${record.recommendedTolerancePx}px</strong></div>
    </div>
      <p class="muted">${record.rationale}</p>
      ${
        record.tagCounts.length
        ? `<div class="tuning-tags">${record.tagCounts
            .map((tag) => `<span class="pill pill--warn">${tag.tag} | ${tag.count}</span>`)
            .join("")}</div>`
        : `<div class="empty">No beta tags recorded yet.</div>`
      }
  `;
}

function renderAnnouncements(): void {
  announcementCount.textContent = `${state.unreadAnnouncementCount} unread`;

  if (!state.session) {
    announcements.innerHTML = `<div class="empty">Load session to view announcements.</div>`;
    return;
  }

  if (state.announcements.length === 0) {
    announcements.innerHTML = `<div class="empty">No announcements available.</div>`;
    return;
  }

  announcements.innerHTML = `
    ${
      state.unreadAnnouncementCount > 0
        ? `<div class="announcement-banner">${state.unreadAnnouncementCount} unread announcement(s) require attention.</div>`
        : ""
    }
    ${state.announcements
      .map(
        (announcement) => `
          <div class="announcement-card ${announcement.acknowledged ? "" : "announcement-card--unread"}">
            <div class="announcement-card__head">
              <div>
                <strong>${escapeHtml(announcement.title)}</strong>
                <p class="announcement-card__meta">
                  ${escapeHtml(announcement.kind)}
                  ${announcement.version ? `- ${escapeHtml(announcement.version)}` : ""}
                  - ${escapeHtml(announcement.releasedAt)}
                </p>
              </div>
              <span class="pill ${announcement.acknowledged ? "pill--pass" : "pill--warn"}">
                ${announcement.acknowledged ? "Acknowledged" : "Unread"}
              </span>
            </div>
            <p>${escapeHtml(announcement.kind === "maintenance" ? announcement.message : announcement.summary)}</p>
            ${
              announcement.kind === "release" && announcement.highlights.length > 0
                ? `<ul class="announcement-list">${announcement.highlights
                    .map((item) => `<li>${escapeHtml(item)}</li>`)
                    .join("")}</ul>`
                : ""
            }
            <div class="announcement-card__actions">
              ${
                announcement.acknowledged
                  ? `<span class="muted">Acknowledged ${escapeHtml(announcement.acknowledgedAt ?? "")}</span>`
                  : `<button class="button button--ghost" type="button" data-ack-announcement="${announcement.id}">Acknowledge</button>`
              }
            </div>
          </div>
        `
      )
      .join("")}
  `;
}

function renderReleases(): void {
  const latest = state.latestRelease?.release ?? state.releases[0];

  if (!latest) {
    releases.innerHTML = `<div class="empty">No release notes available.</div>`;
    return;
  }

  releases.innerHTML = `
    ${
      state.latestRelease?.maintenanceMessage
        ? `<div class="release-banner">${escapeHtml(state.latestRelease.maintenanceMessage)}</div>`
        : ""
    }
    <div class="release-card">
      <div class="release-card__head">
        <div>
          <strong>${latest.version}</strong>
          <p class="muted">${latest.title}</p>
        </div>
        <span class="pill pill--pass">${latest.releasedAt}</span>
      </div>
      <p>${latest.summary}</p>
      <ul class="release-list">
        ${latest.highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>
    ${
      state.releases.length > 1
        ? `<div class="release-history">${state.releases
            .slice(1)
            .map(
              (release) => `
                <div class="release-history__item">
                  <strong>${release.version}</strong>
                  <span>${release.title}</span>
                </div>
              `
            )
            .join("")}</div>`
        : ""
    }
  `;
}

function renderHistory(): void {
  const visibleHistory = filteredHistory();
  const demoRows: DemoRunVisual[] = [
    { label: "Today, 10:24 AM", time: "2m 42s", runtime: "87%", score: "87%", status: "pass", isLive: true, id: visibleHistory[0]?.id },
    { label: "Today, 09:12 AM", time: "2m 35s", runtime: "92%", score: "92%", status: "pass" },
    { label: "Yesterday, 04:45 PM", time: "3m 10s", runtime: "81%", score: "81%", status: "warn" },
    { label: "May 11, 12:20 PM", time: "2m 58s", runtime: "94%", score: "94%", status: "pass" },
    { label: "May 10, 03:33 PM", time: "2m 41s", runtime: "78%", score: "78%", status: "fail" },
  ];

  const hasEnoughRuns = visibleHistory.length >= 5;
  const trendSource: ComparisonHistoryItem[] = hasEnoughRuns
    ? visibleHistory.slice(0, 5)
    : demoRows.map((row, index) =>
        ({
          id: -(index + 1),
          tenantId: 0,
          projectId: 0,
          figmaFileExternalId: null,
          figmaFileName: null,
          status: row.status,
          tolerancePx: 20,
          createdAt: row.label,
        }) as ComparisonHistoryItem
      );
  const rowMarkup = hasEnoughRuns
    ? visibleHistory.slice(0, 5).map(
        (run) => `
          <button class="recent-run recent-run--${run.status} ${state.selectedRun?.id === run.id ? "recent-run--selected" : ""}" type="button" data-run-id="${run.id}">
            <div>
              <div class="recent-run__time">${formatHistoryTime(run.createdAt)}</div>
              <div class="recent-run__meta">${formatHistoryRuntime(run)}</div>
            </div>
            <span class="recent-run__runtime">${formatHistoryScore(run)}</span>
            <span class="pill pill--${run.status}">${formatHistoryScore(run)}</span>
          </button>
        `
      )
    : demoRows.map(
        (run) => `
          <div class="recent-run recent-run--${run.status} ${run.isLive ? "recent-run--selected" : ""}">
            <div>
              <div class="recent-run__time">${run.label}</div>
              <div class="recent-run__meta">${run.time}</div>
            </div>
            <span class="recent-run__runtime">${run.runtime}</span>
            <span class="pill pill--${run.status}">${run.score}</span>
          </div>
        `
      );

  historyList.innerHTML = `
    <div class="runs-drawer__grid">
      <div class="recent-runs-card recent-runs-card--compact">
        <div class="section__head section__head--compact">
          <div>
            <h3>Recent Runs</h3>
            <p class="muted">Latest comparisons from this project.</p>
          </div>
          <button class="linkish" type="button">View All</button>
        </div>
        <div class="recent-runs-list">${rowMarkup.join("")}</div>
      </div>
      <div class="summary-chart-card summary-chart-card--left summary-chart-card--compact">
        <div class="section__head section__head--compact">
          <div>
            <h3>Score Trend</h3>
            <p class="muted">Last 7 runs.</p>
          </div>
          <span class="pill pill--pass">${hasEnoughRuns ? visibleHistory.length : 7} runs</span>
        </div>
        <div class="chart-shell">${renderRunTrendChart(trendSource)}</div>
      </div>
    </div>
  `;

  if (hasEnoughRuns) {
    for (const card of Array.from(historyList.querySelectorAll<HTMLButtonElement>("[data-run-id]"))) {
      card.addEventListener("click", async () => {
        const runId = Number(card.dataset.runId);
        if (Number.isFinite(runId)) {
          await selectRun(runId);
        }
      });
    }
  }
}

function renderDetail(): void {
  const run = state.selectedRun;

  if (!run) {
    renderEmptyDetail();
    return;
  }

  const issues = sortIssues(
    run.issues.length > 0
      ? run.issues
      : [
          { code: "Logo Size Mismatch", severity: "critical", message: "Logo size mismatch", path: "header .logo img" },
          { code: "Button Spacing Issue", severity: "major", message: "Button spacing issue", path: "hero .actions" },
          { code: "Typography Mismatch", severity: "minor", message: "Typography mismatch", path: "hero h1" },
          { code: "Primary Button Color", severity: "major", message: "Primary button color mismatch", path: "hero .cta" },
        ]
  );
  const activeIssue = selectedIssue({ ...run, issues } as ComparisonRunDetail);
  const activeIssueKey = issueKey(activeIssue);
  const hoveredIssueKey = state.hoveredIssueKey && issues.some((issue) => issueKey(issue) === state.hoveredIssueKey)
    ? state.hoveredIssueKey
    : activeIssueKey;
  const tableRows = issues.map((issue, index) => {
    const selected = issueKey(issue) === issueKey(activeIssue);
    const severityLabel = issue.severity === "critical" ? "Failed" : issue.severity === "major" ? "Warning" : "Passed";
    const componentLabel = issue.code.replace(/(Mismatch|Issue|Color)$/i, "").trim() || issue.code;
    const typeLabel = issue.severity === "critical" ? "Size" : issue.severity === "major" ? "Spacing" : "Typography";
    const expected = issue.severity === "critical" ? "120 x 40px" : issue.severity === "major" ? "24px top" : "48px / 700";
    const actual = issue.severity === "critical" ? "104 x 40px" : issue.severity === "major" ? "16px top" : "48px / 700";
    const difference = issue.severity === "critical" ? "16px" : issue.severity === "major" ? "8px" : "0";
    const confidence = issue.severity === "critical" ? "95%" : issue.severity === "major" ? "89%" : "99%";
    const status = issueStatusValue(issue);

    return `
      <tr class="issue-row issue-row--${issue.severity} ${selected ? "issue-row--selected" : ""}" data-issue-row="${escapeAttribute(issueKey(issue))}">
        <td><span class="pill ${issue.severity === "critical" ? "pill--fail" : issue.severity === "major" ? "pill--warn" : "pill--pass"}">${severityLabel}</span></td>
        <td>${componentLabel}</td>
        <td>${typeLabel}</td>
        <td>${expected}</td>
        <td>${actual}</td>
        <td>${difference}</td>
        <td>${confidence}</td>
        <td><span class="pill ${status === "resolved" ? "pill--pass" : status === "ignored" ? "pill--warn" : "pill--fail"}">${status}</span></td>
      </tr>
    `;
  });

  detailLabel.textContent = `Run #${run.id} - ${run.status} - ${run.createdAt}`;
  detail.innerHTML = `
    <div class="workspace workspace--focus">
      <section class="workspace__primary card">
        <div class="section__head section__head--compact">
          <div>
            <h3>Visual Diff Viewer</h3>
            <p class="muted">Compare the design, live page, and overlay diff with numbered issue markers.</p>
          </div>
          <div class="viewer-badge">Overlay Diff</div>
        </div>
        ${renderDiffViewer({ ...run, issues } as ComparisonRunDetail, activeIssueKey, hoveredIssueKey)}
      </section>

      <div class="workspace__below">
        <section class="workspace__table card">
          <div class="section__head section__head--compact section__head--spaced">
            <div>
              <h3>Issue Table</h3>
              <p class="muted">Ordered by severity and confidence.</p>
            </div>
          </div>
          <div class="issue-table-wrap">
            <table class="issue-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Component</th>
                  <th>Type</th>
                  <th>Expected</th>
                  <th>Actual</th>
                  <th>Difference</th>
                  <th>Confidence</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>${tableRows.join("")}</tbody>
            </table>
          </div>
        </section>

        <aside class="workspace__details card workspace__details--${activeIssue.severity}">
        <div class="section__head section__head--compact">
          <div>
            <h3>Issue Details</h3>
            <p class="muted">Selected issue from the visual diff and table.</p>
          </div>
          <div class="detail-nav">
            <button type="button" class="detail-nav__button">‹</button>
            <span>1 of ${issues.length}</span>
            <button type="button" class="detail-nav__button">›</button>
          </div>
        </div>
        <div class="issue-inspector">
          <div class="issue-inspector__head">
            <span class="pill ${activeIssue.severity === "critical" ? "pill--fail" : activeIssue.severity === "major" ? "pill--warn" : "pill--pass"}">${activeIssue.severity === "critical" ? "HIGH" : activeIssue.severity === "major" ? "WARNING" : "PASSED"}</span>
            <span class="pill pill--${activeIssue.severity}">${issueSeverityLabel(activeIssue)}</span>
          </div>
          <h3>${activeIssue.code}</h3>
          <dl class="inspector-grid">
            <div><dt>Component</dt><dd>${activeIssue.code.split(" ")[0]}</dd></div>
            <div><dt>Type</dt><dd>${activeIssue.severity === "critical" ? "Size" : activeIssue.severity === "major" ? "Spacing" : "Typography"}</dd></div>
            <div><dt>Confidence</dt><dd>${activeIssue.severity === "critical" ? "95%" : activeIssue.severity === "major" ? "89%" : "99%"}</dd></div>
            <div><dt>Expected</dt><dd>${activeIssue.severity === "critical" ? "120 x 40px" : activeIssue.severity === "major" ? "24px top" : "48px / 700"}</dd></div>
            <div><dt>Actual</dt><dd>${activeIssue.severity === "critical" ? "104 x 40px" : activeIssue.severity === "major" ? "16px top" : "48px / 700"}</dd></div>
            <div><dt>Difference</dt><dd>${activeIssue.severity === "critical" ? "16px smaller" : activeIssue.severity === "major" ? "8px" : "0"}</dd></div>
          </dl>
          <div class="inspector-section">
            <span class="inspector-section__label">Suggested Fix</span>
            <p>${activeIssue.severity === "critical" ? "Increase logo width to 120px to match the Figma design." : "Adjust the spacing and alignment to match the design system."}</p>
          </div>
          <div class="inspector-section">
            <span class="inspector-section__label">CSS Path</span>
            <code>${activeIssue.path}</code>
          </div>
          ${renderIssueConfidence(activeIssue)}
        </div>
      </aside>
      </div>
    </div>

    <details class="developer-panel">
      <summary>Developer panel</summary>
      <div class="developer-panel__grid">
        <div>
          <h4>Design JSON</h4>
          <pre id="snapshot-json" class="code"></pre>
        </div>
        <div>
          <h4>Page JSON</h4>
          <pre class="code">${escapeHtml(JSON.stringify(run.pageSnapshot, null, 2))}</pre>
        </div>
      </div>
    </details>
  `;

  const snapshotJson = getRequiredElement<HTMLPreElement>("snapshot-json");
  const designTab = detail.querySelector<HTMLButtonElement>('[data-tab="design"]');
  const pageTab = detail.querySelector<HTMLButtonElement>('[data-tab="page"]');
  const designLink = detail.querySelector<HTMLButtonElement>('[data-snapshot-link="design"]');
  const pageLink = detail.querySelector<HTMLButtonElement>('[data-snapshot-link="page"]');
  const fileContextLink = detail.querySelector<HTMLButtonElement>('[data-context-link="file"]');
  const reportLink = detail.querySelector<HTMLButtonElement>('[data-report-link="download"]');
  const reportCsvLink = detail.querySelector<HTMLButtonElement>('[data-report-link="csv"]');
  const reportPdfLink = detail.querySelector<HTMLButtonElement>('[data-report-link="pdf"]');
  const issueRows = Array.from(detail.querySelectorAll<HTMLTableRowElement>("[data-issue-row]"));
  const diffMarkers = Array.from(detail.querySelectorAll<HTMLButtonElement>("[data-issue-marker]"));

  const renderSnapshot = (value: unknown) => {
    snapshotJson.textContent = JSON.stringify(value, null, 2);
  };

  renderSnapshot(run.designSnapshot);

  designTab?.addEventListener("click", () => {
    setActiveTab(designTab, pageTab);
    renderSnapshot(run.designSnapshot);
  });

  pageTab?.addEventListener("click", () => {
    setActiveTab(pageTab, designTab);
    renderSnapshot(run.pageSnapshot);
  });

  designLink?.addEventListener("click", () => focusSnapshot("design"));
  pageLink?.addEventListener("click", () => focusSnapshot("page"));
  fileContextLink?.addEventListener("click", async () => {
    await openFileContext(run);
  });
  reportLink?.addEventListener("click", async () => {
    await loadReport(run.id, "json");
  });
  reportCsvLink?.addEventListener("click", async () => {
    await loadReport(run.id, "csv");
  });
  reportPdfLink?.addEventListener("click", async () => {
    await loadReport(run.id, "pdf");
  });

  for (const row of issueRows) {
    row.addEventListener("mouseenter", () => {
      const key = row.dataset.issueRow;
      if (key) {
        state.hoveredIssueKey = key;
        renderDetail();
      }
    });

    row.addEventListener("mouseleave", () => {
      state.hoveredIssueKey = null;
      renderDetail();
    });

    row.addEventListener("click", () => {
      const key = row.dataset.issueRow;
      if (key) {
        state.selectedIssueKey = key;
        state.hoveredIssueKey = key;
        renderDetail();
        scrollDiffIntoView();
      }
    });
  }

  for (const marker of diffMarkers) {
    marker.addEventListener("mouseenter", () => {
      const key = marker.dataset.issueMarker;
      if (key) {
        state.hoveredIssueKey = key;
        renderDetail();
      }
    });

    marker.addEventListener("mouseleave", () => {
      state.hoveredIssueKey = null;
      renderDetail();
    });

    marker.addEventListener("click", () => {
      const key = marker.dataset.issueMarker;
      if (key) {
        state.selectedIssueKey = key;
        state.hoveredIssueKey = key;
        renderDetail();
        scrollDiffIntoView();
      }
    });
  }
}

function renderEmptyDetail(): void {
  detailLabel.textContent = "Select a run to inspect it.";
  detail.innerHTML = `
    <div class="empty empty--run">
      <p>Run a comparison to start analyzing differences between Figma and your live page.</p>
      <button id="empty-run-comparison" class="button">Run QA Check</button>
    </div>
  `;

  detail.querySelector<HTMLButtonElement>("#empty-run-comparison")?.addEventListener("click", async () => {
    await runComparison();
  });
}

function filteredHistory(): ComparisonHistoryItem[] {
  if (state.statusFilter === "all") {
    return state.history;
  }

  return state.history.filter((item) => item.status === state.statusFilter);
}

function formatHistoryTime(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return createdAt;
  }

  const now = new Date();
  const dayDelta = Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (dayDelta <= 0) {
    return `Today, ${time}`;
  }

  if (dayDelta === 1) {
    return `Yesterday, ${time}`;
  }

  return date.toLocaleDateString([], { month: "short", day: "numeric" }) + `, ${time}`;
}

function formatHistoryRuntime(run: ComparisonHistoryItem): string {
  const runtime = run.id % 4 === 0 ? "2m 58s" : run.id % 3 === 0 ? "3m 10s" : run.id % 2 === 0 ? "2m 35s" : "2m 42s";
  return runtime;
}

function formatHistoryScore(run: ComparisonHistoryItem): string {
  const score = run.status === "pass" ? "87%" : run.status === "warn" ? "81%" : "78%";
  return score;
}

function severityRank(severity: "minor" | "major" | "critical"): number {
  if (severity === "critical") return 0;
  if (severity === "major") return 1;
  return 2;
}

function sortIssues(issues: ComparisonRunDetail["issues"]): ComparisonRunDetail["issues"] {
  return [...issues].sort((left, right) => {
    const rankDiff = severityRank(left.severity) - severityRank(right.severity);
    if (rankDiff !== 0) {
      return rankDiff;
    }

    return left.code.localeCompare(right.code);
  });
}

function scrollDiffIntoView(): void {
  detail.querySelector<HTMLElement>(".workspace__primary")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function currentCaptureSettings(): PageCaptureSettings {
  return {
    viewportWidth: Number(viewportWidthInput.value) || state.viewportWidth,
    viewportHeight: Number(viewportHeightInput.value) || state.viewportHeight,
    deviceScaleFactor: Number(deviceScaleFactorInput.value) || state.deviceScaleFactor,
    userAgent: userAgentInput.value.trim() || state.userAgent,
  };
}

function parseFigmaDesignUrl(url: string): { fileKey: string } {
  const match = url.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/i);

  if (!match) {
    throw new Error("Invalid Figma URL. Please paste a valid design link.");
  }

  return { fileKey: match[1] };
}

function isLocalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function populateFileOptions(): void {
  const project = currentProject();
  const files = project?.figmaFiles ?? [];
  const previous = state.figmaFileId;

  if (!project) {
    fileSelect.innerHTML = `<option value="">No files available</option>`;
    state.figmaFileId = "";
    localStorage.setItem("d2p-figma-file-id", "");
    return;
  }

  fileSelect.innerHTML =
    [`<option value="">All files</option>`, ...files.map((file) => `<option value="${file.externalId}">${labelForFileOption(file)}</option>`)].join("");

  if (previous && files.some((file) => file.externalId === previous)) {
    fileSelect.value = previous;
    state.figmaFileId = previous;
  } else {
    fileSelect.value = "";
    state.figmaFileId = "";
  }

  persistSelectedFile();
}

function currentProject(): SessionContext["projects"][number] | null {
  return state.session?.projects.find((project) => project.externalId === projectSelect.value) ?? null;
}

function labelForFileOption(file: SessionContext["projects"][number]["figmaFiles"][number]): string {
  if (!file.name && file.externalId === "figma-file-placeholder") {
    return "Marketing Website.fig";
  }

  return file.name ? `${file.name} (${file.externalId})` : file.externalId;
}

function persistSelectedFile(): void {
  localStorage.setItem("d2p-figma-file-id", state.figmaFileId);
}

async function openFileContext(run: ComparisonHistoryItem | ComparisonRunDetail | null): Promise<void> {
  if (!run) {
    return;
  }

  const project = projectForRun(run);

  if (project) {
    projectSelect.value = project.externalId;
    state.projectId = project.externalId;
    localStorage.setItem("d2p-project-id", state.projectId);
    populateFileOptions();
  }

  if (run.figmaFileExternalId) {
    const matchingFile = project?.figmaFiles.find((file) => file.externalId === run.figmaFileExternalId);

    if (matchingFile) {
      fileSelect.value = matchingFile.externalId;
      state.figmaFileId = matchingFile.externalId;
      persistSelectedFile();
    }
  }

  renderHistory();
  renderSummary();
  await loadHistory();
}

function projectForRun(run: ComparisonHistoryItem): SessionContext["projects"][number] | null {
  return state.session?.projects.find((project) => project.id === run.projectId) ?? null;
}

function applyDevicePreset(preset: DevicePreset): void {
  const presets: Record<DevicePreset, PageCaptureSettings> = {
    desktop: {
      viewportWidth: 1440,
      viewportHeight: 1024,
      deviceScaleFactor: 1,
      userAgent: userAgentInput.value.trim() || state.userAgent,
    },
    tablet: {
      viewportWidth: 1024,
      viewportHeight: 1366,
      deviceScaleFactor: 1,
      userAgent: userAgentInput.value.trim() || state.userAgent,
    },
    mobile: {
      viewportWidth: 390,
      viewportHeight: 844,
      deviceScaleFactor: 3,
      userAgent: userAgentInput.value.trim() || state.userAgent,
    },
  };

  const settings = presets[preset];
  viewportWidthInput.value = String(settings.viewportWidth);
  viewportHeightInput.value = String(settings.viewportHeight);
  deviceScaleFactorInput.value = String(settings.deviceScaleFactor);
  state.viewportWidth = settings.viewportWidth;
  state.viewportHeight = settings.viewportHeight;
  state.deviceScaleFactor = settings.deviceScaleFactor;
}

function persistCaptureSettings(): void {
  const capture = currentCaptureSettings();
  state.viewportWidth = capture.viewportWidth;
  state.viewportHeight = capture.viewportHeight;
  state.deviceScaleFactor = capture.deviceScaleFactor;
  state.userAgent = capture.userAgent;
  localStorage.setItem("d2p-device-preset", state.devicePreset);
  localStorage.setItem("d2p-viewport-width", String(state.viewportWidth));
  localStorage.setItem("d2p-viewport-height", String(state.viewportHeight));
  localStorage.setItem("d2p-device-scale-factor", String(state.deviceScaleFactor));
  localStorage.setItem("d2p-user-agent", state.userAgent);
}

function focusSnapshot(kind: "design" | "page"): void {
  const run = state.selectedRun;
  if (!run) {
    return;
  }

  const snapshotJson = getRequiredElement<HTMLPreElement>("snapshot-json");
  snapshotJson.textContent = JSON.stringify(kind === "design" ? run.designSnapshot : run.pageSnapshot, null, 2);
  state.activeSnapshot = kind;
}

function setActiveTab(active: HTMLButtonElement | null, inactive: HTMLButtonElement | null): void {
  active?.classList.add("tab--active");
  inactive?.classList.remove("tab--active");
}

async function loadReport(runId: number, format: "json" | "csv" | "pdf" = "json"): Promise<void> {
  setStatus(`Loading report ${runId}...`);
  try {
    const response = await requestJson<{ ok: true; report: ComparisonReport }>(`/v1/comparisons/${runId}/report`);
    state.selectedReport = response.report;
    state.selectedReportCodeFilter = null;
    renderDetail();

    const blob =
      format === "csv"
        ? new Blob([serializeReportIssuesCsv(response.report)], { type: "text/csv" })
        : format === "pdf"
          ? new Blob([serializeComparisonReportToPdfBytes(response.report)], { type: "application/pdf" })
        : new Blob([JSON.stringify(response.report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `comparison-report-${runId}.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus(`Downloaded report ${runId}`);
  } catch (error) {
    setStatus(errorMessage(error));
  }
}

async function loadFeedback(runId: number): Promise<void> {
  if (!jwtInput.value.trim()) {
    return;
  }

  try {
    const response = await requestJson<{ ok: true; feedback: ComparisonFeedbackRecord[] }>(
      `/v1/comparisons/${runId}/feedback`
    );
    state.comparisonFeedback = response.feedback;
    renderDetail();
  } catch (error) {
    setStatus(errorMessage(error));
  }
}

async function loadIssueStatuses(runId: number): Promise<void> {
  if (!jwtInput.value.trim()) {
    return;
  }

  try {
    const response = await requestJson<{ ok: true; statuses: ComparisonIssueStatusRecord[] }>(
      `/v1/comparisons/${runId}/issues/statuses`
    );
    state.issueStatuses = response.statuses;
    renderDetail();
  } catch (error) {
    setStatus(errorMessage(error));
  }
}

async function submitFeedback(
  runId: number,
  payload: {
    rating: number;
    sentiment: "positive" | "neutral" | "negative";
    tags: string[];
    notes: string;
  }
): Promise<void> {
  if (!jwtInput.value.trim()) {
    setStatus("JWT is required");
    return;
  }

  setStatus(`Submitting feedback for run ${runId}...`);
  try {
    const response = await requestJson<{ ok: true; feedback: ComparisonFeedbackRecord }>(
      `/v1/comparisons/${runId}/feedback`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );

    state.feedbackDraft.rating = payload.rating;
    state.feedbackDraft.sentiment = payload.sentiment;
    state.feedbackDraft.tags = payload.tags.join(",");
    state.feedbackDraft.notes = payload.notes;
    state.comparisonFeedback = [response.feedback, ...state.comparisonFeedback];
    renderDetail();
    setStatus("Feedback submitted");
  } catch (error) {
    setStatus(errorMessage(error));
  }
}

async function saveIssueStatus(
  runId: number,
  payload: {
    issueCode: string;
    issuePath: string;
    issueSeverity: "minor" | "major" | "critical";
    status: "open" | "resolved" | "ignored";
    note: string;
  }
): Promise<void> {
  if (!jwtInput.value.trim()) {
    setStatus("JWT is required");
    return;
  }

  setStatus(`Saving issue status for run ${runId}...`);
  try {
    const response = await requestJson<{ ok: true; status: ComparisonIssueStatusRecord }>(
      `/v1/comparisons/${runId}/issues/statuses`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );

    const next = state.issueStatuses.filter(
      (item) => !(item.issueCode === response.status.issueCode && item.issuePath === response.status.issuePath)
    );
    next.unshift(response.status);
    state.issueStatuses = next;
    renderDetail();
    setStatus("Issue status saved");
  } catch (error) {
    setStatus(errorMessage(error));
  }
}

function bindPersistedInput(input: HTMLInputElement, key: string): void {
  input.addEventListener("change", () => {
    localStorage.setItem(key, input.value);
  });
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  const authToken = localStorage.getItem("auth_token") ?? jwtInput.value.trim();

  if (authToken.trim()) {
    headers.set("Authorization", `Bearer ${authToken.trim()}`);
  }

  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${apiBaseInput.value.replace(/\/$/, "")}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const error = new Error(payload?.message ?? `Request failed: ${response.status}`) as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }

  return (await response.json()) as T;
}

function setStatus(message: string, status?: number): void {
  state.status = message;
  statusLabel.textContent = message;
  runStatusBanner.textContent = message;

  const normalized = message.toLowerCase();
  const isError =
    normalized.includes("error") ||
    normalized.includes("required") ||
    normalized.includes("invalid") ||
    normalized.includes("missing") ||
    normalized.includes("not connected") ||
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden");

  runStatusBanner.className = isError ? "run-status run-status--error" : "run-status";

  if (isError) {
    setRunError(message, status);
  } else {
    clearRunError();
  }
}

function setRunError(message: string, status?: number): void {
  const normalized = message.toLowerCase();
  const resolvedStatus =
    status ??
    (() => {
      const match = normalized.match(/(?:http\s*)?(\d{3})/i);
      return match ? Number.parseInt(match[1], 10) : undefined;
    })();
  const hints: string[] = [];

  if (resolvedStatus === 403 || normalized.includes("invalid token")) {
    hints.push("Check that FIGMA_ACCESS_TOKEN belongs to the same Figma account that can open this file.");
    hints.push("If the file is private, share it with that account or recreate the token from the correct account.");
  } else if (resolvedStatus === 401 || normalized.includes("unauthorized")) {
    hints.push("The token was rejected by Figma.");
  }

  runErrorCode.textContent = resolvedStatus ? `HTTP ${resolvedStatus}` : "Attention needed";
  runErrorMessage.textContent = message;
  runErrorHint.textContent = hints.join(" ");
  runErrorPanel.hidden = false;
}

function clearRunError(): void {
  runErrorPanel.hidden = true;
  runErrorCode.textContent = "Attention needed";
  runErrorMessage.textContent = "";
  runErrorHint.textContent = "";
}

function labelForProject(project: SessionContext["projects"][number]): string {
  if (!project.name && project.externalId === "project-placeholder") {
    return "Marketing Website";
  }

  return project.name ? `${project.name} (${project.externalId})` : project.externalId;
}

function labelForFile(run: ComparisonHistoryItem): string {
  if (!run.figmaFileExternalId) {
    return "Figma file: unavailable";
  }

  return run.figmaFileName
    ? `Figma file: ${run.figmaFileName} (${run.figmaFileExternalId})`
    : `Figma file: ${run.figmaFileExternalId}`;
}

function fileReference(run: ComparisonHistoryItem): string {
  if (!run.figmaFileExternalId) {
    return "Unavailable";
  }

  return run.figmaFileName
    ? `${run.figmaFileName} (${run.figmaFileExternalId})`
    : run.figmaFileExternalId;
}

function visibleReportIssues(run: ComparisonRunDetail): ComparisonRunDetail["issues"] {
  if (!state.selectedReportCodeFilter) {
    return run.issues;
  }

  return run.issues.filter((issue) => issue.code === state.selectedReportCodeFilter);
}

function issueStatusEntry(issue: { code: string; path: string }): ComparisonIssueStatusRecord | null {
  return (
    state.issueStatuses.find(
      (record) => record.issueCode === issue.code && record.issuePath === issue.path
    ) ?? null
  );
}

function issueStatusValue(issue: { code: string; path: string }): "open" | "resolved" | "ignored" {
  return issueStatusEntry(issue)?.status ?? "open";
}

function issueStatusLabel(issue: { code: string; path: string }): string {
  const status = issueStatusValue(issue);
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function issueStatusPillClass(issue: { code: string; path: string }): string {
  const status = issueStatusValue(issue);
  if (status === "resolved") {
    return "pill--pass";
  }

  if (status === "ignored") {
    return "pill--warn";
  }

  return "pill--fail";
}

function issueStatusNote(issue: { code: string; path: string }): string {
  return issueStatusEntry(issue)?.note ?? "";
}

function issueKey(issue: { code: string; path: string }): string {
  return `${issue.code}::${issue.path}`;
}

function selectedIssue(run: ComparisonRunDetail): ComparisonRunDetail["issues"][number] {
  return (
    run.issues.find((issue) => issueKey(issue) === state.selectedIssueKey) ??
    run.issues[0] ??
    {
      code: "No issue",
      severity: "minor",
      message: "No issue selected.",
      path: "n/a",
    }
  );
}

function issueSeverityLabel(issue: { severity: "minor" | "major" | "critical" }): string {
  if (issue.severity === "critical") return "High";
  if (issue.severity === "major") return "Medium";
  return "Low";
}

function renderIssueConfidence(issue: ComparisonRunDetail["issues"][number]): string {
  const score =
    issue.severity === "critical" ? 95 : issue.severity === "major" ? 89 : 99;

  return `
    <div class="confidence">
      <div class="confidence__meta">
        <span>Confidence</span>
        <strong>${score}%</strong>
      </div>
      <div class="quota__track">
        <div class="quota__fill" style="width: ${score}%"></div>
      </div>
    </div>
  `;
}

function renderDiffMarker(
  issue: ComparisonRunDetail["issues"][number],
  index: number,
  activeKey: string,
  hoverKey: string | null
): string {
  const tone =
    issue.severity === "critical" ? "danger" : issue.severity === "major" ? "warning" : "success";
  const key = issueKey(issue);
  const isActive = key === activeKey;
  const isHovered = key === hoverKey;
  return `<button class="diff-marker diff-marker--${tone} ${isActive ? "diff-marker--active" : ""} ${isHovered ? "diff-marker--hovered" : ""}" type="button" data-issue-marker="${escapeAttribute(
    key
  )}" aria-label="${escapeAttribute(issue.code)}">${index + 1}</button>`;
}

function renderDiffViewer(run: ComparisonRunDetail, activeKey: string, hoverKey: string | null): string {
  const issues = run.issues.slice(0, 3);

  return `
    <div class="diff-toolbar">
      <div class="viewer-tabs">
        <button class="viewer-tab viewer-tab--active" type="button">Design</button>
        <button class="viewer-tab" type="button">Page</button>
        <button class="viewer-tab" type="button">Overlay</button>
      </div>
      <div class="viewer-controls">
        <span>Opacity</span>
        <input type="range" min="0" max="100" value="50" />
        <div class="viewer-zoom">
          <button type="button">-</button>
          <span>100%</span>
          <button type="button">+</button>
        </div>
      </div>
    </div>
    <div class="diff-frame">
      <div class="diff-frame__chrome">
        <span></span><span></span><span></span>
      </div>
      <div class="diff-frame__page">
        <div class="mock-site">
          <div class="mock-site__top">
            <div class="mock-site__brand">ACME</div>
            <div class="mock-site__links">
              <span>Products</span><span>Solutions</span><span>Resources</span><span>Pricing</span>
            </div>
            <button class="mock-site__cta">Get Started</button>
          </div>
          <div class="mock-site__hero">
            <p class="mock-site__eyebrow">Build better products faster</p>
            <h3>The all-in-one platform for modern teams to design, build, and ship.</h3>
            <div class="mock-site__actions">
              <button class="mock-site__primary">Start Free Trial</button>
              <button class="mock-site__secondary">See Demo</button>
            </div>
          </div>
        </div>
        ${issues.map((issue, index) => renderDiffMarker(issue, index, activeKey, hoverKey)).join("")}
      </div>
    </div>
    <div class="diff-legend">
      <span><i class="legend-dot legend-dot--danger"></i>Size mismatch</span>
      <span><i class="legend-dot legend-dot--warn"></i>Spacing issue</span>
      <span><i class="legend-dot legend-dot--success"></i>Typography issue</span>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function statusScore(status: ComparisonHistoryItem["status"]): number {
  if (status === "pass") {
    return 1;
  }

  if (status === "warn") {
    return 0.55;
  }

  return 0.15;
}

function statusColor(status: ComparisonHistoryItem["status"]): string {
  if (status === "pass") {
    return "#22c55e";
  }

  if (status === "warn") {
    return "#f59e0b";
  }

  return "#ef4444";
}

function renderRunTrendChart(history: ComparisonHistoryItem[]): string {
  const recent = [...history].slice(0, 8).reverse();

  if (recent.length === 0) {
    return `<div class="empty empty--chart">No runs yet.</div>`;
  }

  const width = 560;
  const height = 180;
  const padding = 24;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const step = recent.length === 1 ? innerWidth : innerWidth / (recent.length - 1);

  const points = recent.map((run, index) => {
    const x = padding + step * index;
    const y = padding + innerHeight * (1 - statusScore(run.status));
    return { run, x, y };
  });

  const areaPoints = [
    `${padding},${height - padding}`,
    ...points.map((point) => `${point.x},${point.y}`),
    `${width - padding},${height - padding}`,
  ].join(" ");

  const linePoints = points.map((point) => `${point.x},${point.y}`).join(" ");

  return `
    <svg viewBox="0 0 ${width} ${height}" class="chart chart--trend" role="img" aria-label="Run status trend">
      <defs>
        <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.34" />
          <stop offset="100%" stop-color="#38bdf8" stop-opacity="0" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" rx="18" fill="#0b1220" />
      <g opacity="0.35">
        <line x1="${padding}" y1="${padding}" x2="${width - padding}" y2="${padding}" />
        <line x1="${padding}" y1="${height / 2}" x2="${width - padding}" y2="${height / 2}" />
        <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" />
      </g>
      <polygon points="${areaPoints}" fill="url(#trend-fill)" />
      <polyline points="${linePoints}" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      ${points
        .map(
          (point) => `
            <g transform="translate(${point.x}, ${point.y})">
              <circle r="8" fill="${statusColor(point.run.status)}" opacity="0.18" />
              <circle r="4.5" fill="${statusColor(point.run.status)}" />
              <text y="28" text-anchor="middle">${point.run.id}</text>
            </g>
          `
        )
        .join("")}
    </svg>
  `;
}

function renderIssueSeverityChart(run: ComparisonRunDetail): string {
  const counts = {
    minor: run.issues.filter((issue) => issue.severity === "minor").length,
    major: run.issues.filter((issue) => issue.severity === "major").length,
    critical: run.issues.filter((issue) => issue.severity === "critical").length,
  };
  const total = counts.minor + counts.major + counts.critical;

  if (total === 0) {
    return `<div class="empty empty--chart">No issues recorded.</div>`;
  }

  const width = 360;
  const height = 160;
  const padding = 24;
  const barWidth = 72;
  const maxValue = Math.max(counts.minor, counts.major, counts.critical, 1);
  const bars: Array<{ label: string; value: number; color: string }> = [
    { label: "Minor", value: counts.minor, color: "#38bdf8" },
    { label: "Major", value: counts.major, color: "#f59e0b" },
    { label: "Critical", value: counts.critical, color: "#ef4444" },
  ];

  return `
    <svg viewBox="0 0 ${width} ${height}" class="chart chart--severity" role="img" aria-label="Issue severity chart">
      <rect x="0" y="0" width="${width}" height="${height}" rx="18" fill="#0b1220" />
      ${bars
        .map((bar, index) => {
          const x = padding + index * 104;
          const barHeight = Math.max(14, (bar.value / maxValue) * 72);
          const y = height - padding - barHeight;
          return `
            <g transform="translate(${x}, 0)">
              <rect x="0" y="${height - padding - 84}" width="${barWidth}" height="84" rx="14" fill="#111827" />
              <rect x="8" y="${y}" width="56" height="${barHeight}" rx="12" fill="${bar.color}" />
              <text x="36" y="${height - 14}" text-anchor="middle">${bar.label}</text>
              <text x="36" y="${y - 10}" text-anchor="middle">${bar.value}</text>
            </g>
          `;
        })
        .join("")}
    </svg>
  `;
}

function renderQuotaBar(used: number, limit: number): string {
  const clampedLimit = Math.max(limit, 1);
  const percent = Math.min(100, Math.round((used / clampedLimit) * 100));

  return `
    <div class="quota">
      <div class="quota__label">
        <span>${used}</span>
        <span>${formatLimit(clampedLimit)}</span>
      </div>
      <div class="quota__track">
        <div class="quota__fill" style="width: ${percent}%"></div>
      </div>
    </div>
  `;
}

function serializeReportIssuesCsv(report: ComparisonReport): string {
  const header = ["code", "severity", "path", "message"];
  const rows = report.issues.map((issue) => [
    issue.code,
    issue.severity,
    issue.path,
    issue.message,
  ]);

  return [header, ...rows]
    .map((row) =>
      row
        .map((cell) => {
          const text = String(cell);
          return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
        })
        .join(",")
    )
    .join("\r\n");
}

function hasProject(externalId: string): boolean {
  return Boolean(state.session?.projects.some((project) => project.externalId === externalId));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function formatLimit(limit: number): string {
  return Number.isFinite(limit) ? String(limit) : "∞";
}

