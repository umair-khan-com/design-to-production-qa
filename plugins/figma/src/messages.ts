import type { DesignSnapshotPayload } from "@d2p/shared";

export type PluginExportMode = "selection" | "page";

export interface PluginExportRequest {
  type: "extract-design";
  mode: PluginExportMode;
  settings: PluginSettings;
}

export interface PluginSettings {
  apiBaseUrl: string;
  jwt: string;
  tenantId: string;
  projectId: string;
  figmaFileId: string;
}

export interface PluginSessionFigmaFile {
  id: number;
  externalId: string;
  name: string | null;
}

export interface PluginSessionProject {
  id: number;
  externalId: string;
  name: string | null;
  figmaFiles: PluginSessionFigmaFile[];
}

export interface PluginSessionContext {
  tenantId: string;
  userId: string;
  projects: PluginSessionProject[];
}

export interface PluginUploadRequest {
  type: "upload-design";
  mode: PluginExportMode;
  settings: PluginSettings;
}

export interface PluginLoadSessionRequest {
  type: "load-session";
  settings: Pick<PluginSettings, "apiBaseUrl" | "jwt">;
}

export interface PluginStatusMessage {
  type: "status";
  message: string;
}

export interface PluginErrorMessage {
  type: "error";
  message: string;
}

export interface PluginSnapshotMessage {
  type: "snapshot";
  payload: DesignSnapshotPayload;
}

export interface PluginSettingsLoadedMessage {
  type: "settings-loaded";
  settings: PluginSettings;
}

export interface PluginSessionContextLoadedMessage {
  type: "session-context-loaded";
  context: PluginSessionContext;
}

export type PluginToUiMessage =
  | PluginStatusMessage
  | PluginErrorMessage
  | PluginSnapshotMessage
  | PluginSettingsLoadedMessage
  | PluginSessionContextLoadedMessage;

export type UiToPluginMessage = PluginExportRequest | PluginUploadRequest | PluginLoadSessionRequest;
