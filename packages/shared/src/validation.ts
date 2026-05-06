import type {
  DesignNode,
  DesignSnapshotPayload,
  PageCaptureSettings,
  PageElementSnapshot,
  PageSnapshotPayload,
  SnapshotMetadata,
} from "./types.ts";

const SUPPORTED_NODE_TYPES = new Set([
  "FRAME",
  "GROUP",
  "INSTANCE",
  "COMPONENT",
  "TEXT",
  "RECTANGLE",
  "ELLIPSE",
  "VECTOR",
  "IMAGE",
  "BOOLEAN_OPERATION",
  "LINE",
]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

function validatePageBox(box: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isPlainObject(box)) {
    issues.push({ path, message: "box must be an object" });
    return;
  }

  for (const key of ["x", "y", "width", "height"] as const) {
    if (!isFiniteNumber(box[key])) {
      issues.push({ path: `${path}.${key}`, message: `${key} must be a finite number` });
    }
  }
}

function validateBounds(bounds: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isPlainObject(bounds)) {
    issues.push({ path, message: "bounds must be an object" });
    return;
  }

  for (const key of ["x", "y", "width", "height"] as const) {
    if (!isFiniteNumber(bounds[key])) {
      issues.push({ path: `${path}.${key}`, message: `${key} must be a finite number` });
    }
  }
}

function validateDesignNode(node: DesignNode, path: string, issues: ValidationIssue[]): void {
  if (!node.id) issues.push({ path: `${path}.id`, message: "id is required" });
  if (!node.name) issues.push({ path: `${path}.name`, message: "name is required" });
  if (!SUPPORTED_NODE_TYPES.has(node.type)) {
    issues.push({ path: `${path}.type`, message: `unsupported node type: ${node.type}` });
  }

  validateBounds(node.bounds, `${path}.bounds`, issues);

  if (node.text !== null && typeof node.text !== "string") {
    issues.push({ path: `${path}.text`, message: "text must be string or null" });
  }

  if (!isPlainObject(node.styles)) {
    issues.push({ path: `${path}.styles`, message: "styles must be an object" });
  }

  if (node.media !== undefined) {
    if (!isPlainObject(node.media)) {
      issues.push({ path: `${path}.media`, message: "media must be an object" });
    } else {
      for (const key of ["imageUrl", "imageBase64"] as const) {
        const value = node.media[key];

        if (value !== undefined && typeof value !== "string") {
          issues.push({ path: `${path}.media.${key}`, message: `${key} must be a string` });
        }
      }
    }
  }

  if (!Array.isArray(node.children)) {
    issues.push({ path: `${path}.children`, message: "children must be an array" });
    return;
  }

  node.children.forEach((child, index) => validateDesignNode(child, `${path}.children[${index}]`, issues));
}

function validateSnapshotMetadata(metadata: SnapshotMetadata, path: string, issues: ValidationIssue[]): void {
  if (!metadata.payloadVersion) {
    issues.push({ path: `${path}.payloadVersion`, message: "payloadVersion is required" });
  }

  if (!metadata.schemaVersion) {
    issues.push({ path: `${path}.schemaVersion`, message: "schemaVersion is required" });
  }

  if (!metadata.capturedAt) {
    issues.push({ path: `${path}.capturedAt`, message: "capturedAt is required" });
  }

  if (!metadata.producer) {
    issues.push({ path: `${path}.producer`, message: "producer is required" });
  }
}

function validatePageElement(node: PageElementSnapshot, path: string, issues: ValidationIssue[]): void {
  if (!node.key) issues.push({ path: `${path}.key`, message: "key is required" });
  if (!node.tagName) issues.push({ path: `${path}.tagName`, message: "tagName is required" });

  validatePageBox(node.box, `${path}.box`, issues);

  if (node.text !== null && typeof node.text !== "string") {
    issues.push({ path: `${path}.text`, message: "text must be string or null" });
  }

  for (const key of ["role", "ariaLabel", "placeholder", "inputType", "href"] as const) {
    const value = node[key];

    if (value !== undefined && value !== null && typeof value !== "string") {
      issues.push({ path: `${path}.${key}`, message: `${key} must be string or null` });
    }
  }

  if (!Array.isArray(node.children)) {
    issues.push({ path: `${path}.children`, message: "children must be an array" });
    return;
  }

  node.children.forEach((child, index) => validatePageElement(child, `${path}.children[${index}]`, issues));
}

function validatePageCaptureSettings(
  capture: PageCaptureSettings,
  path: string,
  issues: ValidationIssue[]
): void {
  if (capture.viewportWidth !== undefined && !isFiniteNumber(capture.viewportWidth)) {
    issues.push({ path: `${path}.viewportWidth`, message: "viewportWidth must be a finite number" });
  }

  if (capture.viewportHeight !== undefined && !isFiniteNumber(capture.viewportHeight)) {
    issues.push({ path: `${path}.viewportHeight`, message: "viewportHeight must be a finite number" });
  }

  if (capture.deviceScaleFactor !== undefined && !isFiniteNumber(capture.deviceScaleFactor)) {
    issues.push({
      path: `${path}.deviceScaleFactor`,
      message: "deviceScaleFactor must be a finite number",
    });
  }

  if (capture.userAgent !== undefined && typeof capture.userAgent !== "string") {
    issues.push({ path: `${path}.userAgent`, message: "userAgent must be a string" });
  }

  if (capture.isMobile !== undefined && typeof capture.isMobile !== "boolean") {
    issues.push({ path: `${path}.isMobile`, message: "isMobile must be a boolean" });
  }
}

export function validateDesignSnapshot(payload: DesignSnapshotPayload): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!payload.tenantId) issues.push({ path: "tenantId", message: "tenantId is required" });
  if (!payload.projectId) issues.push({ path: "projectId", message: "projectId is required" });
  if (!payload.figmaFileId) issues.push({ path: "figmaFileId", message: "figmaFileId is required" });
  if (!payload.metadata) {
    issues.push({ path: "metadata", message: "metadata is required" });
  } else {
    validateSnapshotMetadata(payload.metadata, "metadata", issues);
  }

  if (!Array.isArray(payload.nodes)) {
    issues.push({ path: "nodes", message: "nodes must be an array" });
  } else {
    payload.nodes.forEach((node, index) => validateDesignNode(node, `nodes[${index}]`, issues));
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function validatePageSnapshot(payload: PageSnapshotPayload): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!payload.tenantId) issues.push({ path: "tenantId", message: "tenantId is required" });
  if (!payload.projectId) issues.push({ path: "projectId", message: "projectId is required" });
  if (!payload.pageUrl) issues.push({ path: "pageUrl", message: "pageUrl is required" });
  if (!payload.schemaVersion) issues.push({ path: "schemaVersion", message: "schemaVersion is required" });

  if (payload.capture) {
    validatePageCaptureSettings(payload.capture, "capture", issues);
  }

  if (!Array.isArray(payload.roots)) {
    issues.push({ path: "roots", message: "roots must be an array" });
  } else {
    payload.roots.forEach((node, index) => validatePageElement(node, `roots[${index}]`, issues));
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
