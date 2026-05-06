export type TenantId = string;
export type ProjectId = string;
export type FigmaFileId = string;
export type NodeType =
  | "FRAME"
  | "GROUP"
  | "INSTANCE"
  | "COMPONENT"
  | "TEXT"
  | "RECTANGLE"
  | "ELLIPSE"
  | "VECTOR"
  | "IMAGE"
  | "BOOLEAN_OPERATION"
  | "LINE";

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RGBAColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface PaintSummary {
  type: string;
  color?: RGBAColor;
  opacity?: number;
  visible?: boolean;
  blendMode?: string;
  imageHash?: string;
}

export interface TextStyleSnapshot {
  fontName?: string;
  fontSize?: number;
  lineHeight?: number;
  letterSpacing?: number;
  textCase?: string;
  textDecoration?: string;
  paragraphIndent?: number;
  paragraphSpacing?: number;
  textAlignHorizontal?: string;
  textAlignVertical?: string;
}

export interface LayoutSnapshot {
  layoutMode?: string;
  primaryAxisSizingMode?: string;
  counterAxisSizingMode?: string;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  strokeAlign?: string;
  cornerRadius?: number;
}

export interface ComponentSnapshot {
  componentId?: string;
  componentProperties?: Record<string, string>;
  variantProperties?: Record<string, string>;
}

export interface DesignNode {
  id: string;
  name: string;
  type: NodeType;
  bounds: Bounds;
  visible?: boolean;
  opacity?: number;
  fills?: PaintSummary[];
  strokes?: PaintSummary[];
  effects?: Array<Record<string, unknown>>;
  text: string | null;
  textStyle?: TextStyleSnapshot;
  layout?: LayoutSnapshot;
  component?: ComponentSnapshot;
  media?: {
    imageUrl?: string;
    imageBase64?: string;
  };
  styles: Record<string, unknown>;
  children: DesignNode[];
}

export interface SnapshotMetadata {
  payloadVersion: string;
  schemaVersion: string;
  capturedAt: string;
  producer: string;
}

export interface DesignSnapshotPayload {
  tenantId: TenantId;
  projectId: ProjectId;
  figmaFileId: FigmaFileId;
  metadata: SnapshotMetadata;
  nodes: DesignNode[];
}

export interface ComparisonIssue {
  code: string;
  severity: "minor" | "major" | "critical";
  message: string;
  path: string;
}

export interface ComparisonIssueGroup {
  code: string;
  count: number;
  severity: "minor" | "major" | "critical";
}

export interface ComparisonIssuePattern {
  code: string;
  severity: "minor" | "major" | "critical";
  count: number;
  samplePaths: string[];
  sampleMessage: string;
}

export interface ComparisonReportSummary {
  status: "pass" | "warn" | "fail";
  totalIssues: number;
  minorIssues: number;
  majorIssues: number;
  criticalIssues: number;
  tolerancePx: number;
}

export interface ComparisonReport {
  tenantId: TenantId;
  projectId: ProjectId;
  figmaFileId?: FigmaFileId | null;
  summary: ComparisonReportSummary;
  issueGroups: ComparisonIssueGroup[];
  issuePatterns: ComparisonIssuePattern[];
  issues: ComparisonIssue[];
  designSnapshot: DesignSnapshotPayload;
  pageSnapshot: PageSnapshotPayload;
}

export interface ComparisonResult {
  tenantId: TenantId;
  projectId: ProjectId;
  status: "pass" | "warn" | "fail";
  issues: ComparisonIssue[];
}

export interface PageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageElementSnapshot {
  key: string;
  tagName: string;
  text: string | null;
  box: PageBox;
  visible?: boolean;
  role?: string | null;
  ariaLabel?: string | null;
  placeholder?: string | null;
  inputType?: string | null;
  href?: string | null;
  styles?: Record<string, string>;
  children: PageElementSnapshot[];
}

export interface PageCaptureSettings {
  viewportWidth?: number;
  viewportHeight?: number;
  deviceScaleFactor?: number;
  userAgent?: string;
  isMobile?: boolean;
}

export interface PageSnapshotPayload {
  tenantId: TenantId;
  projectId: ProjectId;
  pageUrl: string;
  schemaVersion: string;
  capture?: PageCaptureSettings;
  roots: PageElementSnapshot[];
}

export interface ComparisonRequest {
  tenantId: TenantId;
  projectId: ProjectId;
  designSnapshot: DesignSnapshotPayload;
  pageSnapshot: PageSnapshotPayload;
  tolerancePx?: number;
}

export type WebhookEventType = "comparison.created" | "comparison.failed";

export interface WebhookComparisonEventPayload {
  eventId: string;
  eventType: WebhookEventType;
  occurredAt: string;
  tenantId: TenantId;
  projectId: ProjectId;
  figmaFileId?: FigmaFileId | null;
  comparison: ComparisonResult;
  storedComparison: {
    id: number;
    tenantId: number;
    projectId: number;
    status: ComparisonResult["status"];
    tolerancePx: number;
    createdAt: string;
  };
  designSnapshot: DesignSnapshotPayload;
  pageSnapshot: PageSnapshotPayload;
}

export interface WebhookDeliveryEnvelope {
  eventType: WebhookEventType;
  data: WebhookComparisonEventPayload;
}
