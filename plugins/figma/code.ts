import type {
  PluginLoadSessionRequest,
  PluginSessionContext,
  PluginSettings,
  UiToPluginMessage,
} from "./src/messages";
import { createDesignSnapshot } from "./src/extract";
import { getExportTargets, openPluginUi, sendStatus } from "./src/runtime";
import { validateDesignSnapshot } from "@d2p/shared";

declare const figma: {
  ui: {
    onmessage: ((message: UiToPluginMessage) => void) | null;
    postMessage(message: unknown): void;
  };
  clientStorage: {
    getAsync(key: string): Promise<unknown>;
    setAsync(key: string, value: unknown): Promise<void>;
  };
  closePlugin(message?: string): void;
  notify(message: string): void;
};

const DEFAULT_SCHEMA_VERSION = "1.0.0";
const SETTINGS_STORAGE_KEY = "d2p.plugin.settings";

const EMPTY_SETTINGS: PluginSettings = {
  apiBaseUrl: "",
  jwt: "",
  tenantId: "",
  projectId: "",
  figmaFileId: "",
};

let currentSettings: PluginSettings = { ...EMPTY_SETTINGS };

type SessionAction = PluginLoadSessionRequest | { type: "extract-design" | "upload-design"; mode: "selection" | "page"; settings: PluginSettings };

openPluginUi();
sendStatus("Loading saved settings...");

async function loadSettings(): Promise<PluginSettings> {
  const stored = await figma.clientStorage.getAsync(SETTINGS_STORAGE_KEY);

  if (!stored || typeof stored !== "object") {
    return { ...EMPTY_SETTINGS };
  }

  const candidate = stored as Partial<PluginSettings>;

  return {
    apiBaseUrl: typeof candidate.apiBaseUrl === "string" ? candidate.apiBaseUrl : "",
    jwt: typeof candidate.jwt === "string" ? candidate.jwt : "",
    tenantId: typeof candidate.tenantId === "string" ? candidate.tenantId : "",
    projectId: typeof candidate.projectId === "string" ? candidate.projectId : "",
    figmaFileId: typeof candidate.figmaFileId === "string" ? candidate.figmaFileId : "",
  };
}

async function persistSettings(settings: PluginSettings): Promise<void> {
  currentSettings = settings;
  await figma.clientStorage.setAsync(SETTINGS_STORAGE_KEY, settings);
}

async function fetchSessionContext(settings: Pick<PluginSettings, "apiBaseUrl" | "jwt">): Promise<PluginSessionContext> {
  if (!settings.apiBaseUrl || !settings.jwt) {
    throw new Error("API base URL and JWT are required to load session context");
  }

  const response = await fetch(`${settings.apiBaseUrl.replace(/\/$/, "")}/v1/session-context`, {
    headers: {
      Authorization: `Bearer ${settings.jwt}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Session lookup failed: ${response.status} ${text}`);
  }

  const payload = (await response.json()) as { ok: true; context: PluginSessionContext };
  return payload.context;
}

async function uploadSnapshot(
  snapshot: ReturnType<typeof createDesignSnapshot>,
  settings: Pick<PluginSettings, "apiBaseUrl" | "jwt">
): Promise<void> {
  if (!settings.apiBaseUrl || !settings.jwt) {
    throw new Error("API base URL and JWT are required before upload");
  }

  const response = await fetch(`${settings.apiBaseUrl.replace(/\/$/, "")}/v1/design-snapshots`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.jwt}`,
    },
    body: JSON.stringify(snapshot),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload failed: ${response.status} ${text}`);
  }
}

function snapshotIdentityFrom(settings: PluginSettings) {
  if (!settings.tenantId || !settings.projectId || !settings.figmaFileId) {
    throw new Error("Tenant, project, and figma file IDs are required");
  }

  return {
    tenantId: settings.tenantId,
    projectId: settings.projectId,
    figmaFileId: settings.figmaFileId,
  };
}

function emitSessionContext(context: PluginSessionContext): void {
  figma.ui.postMessage({ type: "session-context-loaded", context });
}

async function handleSessionLoad(message: PluginLoadSessionRequest): Promise<void> {
  const mergedSettings = {
    ...currentSettings,
    ...message.settings,
  };

  await persistSettings(mergedSettings);
  const context = await fetchSessionContext(message.settings);

  const defaultProject = context.projects[0];
  const defaultFile = defaultProject?.figmaFiles[0];

  const hydratedSettings: PluginSettings = {
    ...mergedSettings,
    tenantId: context.tenantId,
    projectId: mergedSettings.projectId || defaultProject?.externalId || "",
    figmaFileId: mergedSettings.figmaFileId || defaultFile?.externalId || "",
  };

  await persistSettings(hydratedSettings);
  emitSessionContext(context);
  figma.ui.postMessage({ type: "settings-loaded", settings: hydratedSettings });
  sendStatus("Session loaded.");
}

async function handleSnapshotAction(message: SessionAction): Promise<void> {
  const effectiveSettings = {
    ...currentSettings,
    ...("settings" in message ? message.settings : {}),
  };

  await persistSettings(effectiveSettings);

  const identity = snapshotIdentityFrom(effectiveSettings);
  const targets = getExportTargets(message.mode);
  const snapshot = createDesignSnapshot(
    identity.tenantId,
    identity.projectId,
    identity.figmaFileId,
    DEFAULT_SCHEMA_VERSION,
    targets
  );
  const validation = validateDesignSnapshot(snapshot);

  if (!validation.valid) {
    const details = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    figma.ui.postMessage({
      type: "error",
      message: `Snapshot validation failed: ${details}`,
    });
    figma.notify("Snapshot validation failed");
    return;
  }

  if (message.type === "upload-design") {
    await uploadSnapshot(snapshot, {
      apiBaseUrl: effectiveSettings.apiBaseUrl,
      jwt: effectiveSettings.jwt,
    });
    figma.ui.postMessage({ type: "snapshot", payload: snapshot });
    figma.notify("Snapshot uploaded");
    return;
  }

  figma.ui.postMessage({ type: "snapshot", payload: snapshot });
  figma.notify(`Exported ${snapshot.nodes.length} root nodes`);
}

async function bootstrap(): Promise<void> {
  currentSettings = await loadSettings();
  figma.ui.postMessage({ type: "settings-loaded", settings: currentSettings });
  sendStatus("Settings loaded.");
}

figma.ui.onmessage = (message) => {
  if (message.type === "load-session") {
    void handleSessionLoad(message).catch((error) => {
      const messageText = error instanceof Error ? error.message : "Unknown session error";
      figma.ui.postMessage({ type: "error", message: messageText });
      figma.notify(messageText);
    });
    return;
  }

  if (message.type !== "extract-design" && message.type !== "upload-design") {
    return;
  }

  void handleSnapshotAction(message).catch((error) => {
    const messageText = error instanceof Error ? error.message : "Unknown export error";
    figma.ui.postMessage({ type: "error", message: messageText });
    figma.notify(messageText);
  });
};

void bootstrap();

