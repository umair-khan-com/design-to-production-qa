import type {
  Bounds,
  ComponentSnapshot,
  DesignNode,
  DesignSnapshotPayload,
  LayoutSnapshot,
  PaintSummary,
  SnapshotMetadata,
  TextStyleSnapshot,
} from "@d2p/shared";

const PLUGIN_VERSION = "0.1.0";

export interface FigmaLikeNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  opacity?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  absoluteBoundingBox?: Bounds;
  fills?: Array<Record<string, unknown>>;
  strokes?: Array<Record<string, unknown>>;
  effects?: Array<Record<string, unknown>>;
  characters?: string;
  fontName?: { family?: string; style?: string } | string | null;
  fontSize?: number;
  lineHeight?: { value?: number };
  letterSpacing?: { value?: number };
  textCase?: string;
  textDecoration?: string;
  paragraphIndent?: number;
  paragraphSpacing?: number;
  textAlignHorizontal?: string;
  textAlignVertical?: string;
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
  componentId?: string;
  componentProperties?: Record<string, string>;
  variantProperties?: Record<string, string>;
  children?: FigmaLikeNode[];
}

function normalizeBounds(node: FigmaLikeNode): Bounds {
  if (node.absoluteBoundingBox) {
    return node.absoluteBoundingBox;
  }

  return {
    x: node.x ?? 0,
    y: node.y ?? 0,
    width: node.width ?? 0,
    height: node.height ?? 0,
  };
}

function summarizePaint(paint: Record<string, unknown>): PaintSummary {
  const color = paint.color as
    | {
        r?: number;
        g?: number;
        b?: number;
        a?: number;
      }
    | undefined;

  return {
    type: typeof paint.type === "string" ? paint.type : "UNKNOWN",
    color:
      color && typeof color.r === "number" && typeof color.g === "number" && typeof color.b === "number"
        ? {
            r: color.r,
            g: color.g,
            b: color.b,
            a: typeof color.a === "number" ? color.a : 1,
          }
        : undefined,
    opacity: typeof paint.opacity === "number" ? paint.opacity : undefined,
    visible: typeof paint.visible === "boolean" ? paint.visible : undefined,
    blendMode: typeof paint.blendMode === "string" ? paint.blendMode : undefined,
    imageHash: typeof paint.imageHash === "string" ? paint.imageHash : undefined,
  };
}

function extractPaintSummaries(paints?: Array<Record<string, unknown>>): PaintSummary[] | undefined {
  if (!Array.isArray(paints) || paints.length === 0) {
    return undefined;
  }

  return paints.map(summarizePaint);
}

function extractTextStyle(node: FigmaLikeNode): TextStyleSnapshot | undefined {
  if (node.type !== "TEXT") {
    return undefined;
  }

  return {
    fontName:
      typeof node.fontName === "string"
        ? node.fontName
        : node.fontName && typeof node.fontName.family === "string"
          ? node.fontName.family
          : undefined,
    fontSize: typeof node.fontSize === "number" ? node.fontSize : undefined,
    lineHeight: typeof node.lineHeight?.value === "number" ? node.lineHeight.value : undefined,
    letterSpacing:
      typeof node.letterSpacing?.value === "number" ? node.letterSpacing.value : undefined,
    textCase: typeof node.textCase === "string" ? node.textCase : undefined,
    textDecoration: typeof node.textDecoration === "string" ? node.textDecoration : undefined,
    paragraphIndent: typeof node.paragraphIndent === "number" ? node.paragraphIndent : undefined,
    paragraphSpacing: typeof node.paragraphSpacing === "number" ? node.paragraphSpacing : undefined,
    textAlignHorizontal:
      typeof node.textAlignHorizontal === "string" ? node.textAlignHorizontal : undefined,
    textAlignVertical: typeof node.textAlignVertical === "string" ? node.textAlignVertical : undefined,
  };
}

function extractLayout(node: FigmaLikeNode): LayoutSnapshot | undefined {
  const layout: LayoutSnapshot = {};

  if (typeof node.layoutMode === "string") layout.layoutMode = node.layoutMode;
  if (typeof node.primaryAxisSizingMode === "string") {
    layout.primaryAxisSizingMode = node.primaryAxisSizingMode;
  }
  if (typeof node.counterAxisSizingMode === "string") {
    layout.counterAxisSizingMode = node.counterAxisSizingMode;
  }
  if (typeof node.primaryAxisAlignItems === "string") {
    layout.primaryAxisAlignItems = node.primaryAxisAlignItems;
  }
  if (typeof node.counterAxisAlignItems === "string") {
    layout.counterAxisAlignItems = node.counterAxisAlignItems;
  }
  if (typeof node.itemSpacing === "number") layout.itemSpacing = node.itemSpacing;
  if (typeof node.paddingTop === "number") layout.paddingTop = node.paddingTop;
  if (typeof node.paddingRight === "number") layout.paddingRight = node.paddingRight;
  if (typeof node.paddingBottom === "number") layout.paddingBottom = node.paddingBottom;
  if (typeof node.paddingLeft === "number") layout.paddingLeft = node.paddingLeft;
  if (typeof node.strokeAlign === "string") layout.strokeAlign = node.strokeAlign;
  if (typeof node.cornerRadius === "number") layout.cornerRadius = node.cornerRadius;

  return Object.keys(layout).length > 0 ? layout : undefined;
}

function extractComponent(node: FigmaLikeNode): ComponentSnapshot | undefined {
  const component: ComponentSnapshot = {};

  if (typeof node.componentId === "string") component.componentId = node.componentId;
  if (node.componentProperties && typeof node.componentProperties === "object") {
    component.componentProperties = node.componentProperties;
  }
  if (node.variantProperties && typeof node.variantProperties === "object") {
    component.variantProperties = node.variantProperties;
  }

  return Object.keys(component).length > 0 ? component : undefined;
}

export function extractDesignNode(node: FigmaLikeNode, depth = 0, maxDepth = 8): DesignNode {
  const fills = extractPaintSummaries(node.fills);
  const strokes = extractPaintSummaries(node.strokes);
  const textStyle = extractTextStyle(node);
  const layout = extractLayout(node);
  const component = extractComponent(node);
  const children = depth >= maxDepth ? [] : (node.children ?? []).map((child) => extractDesignNode(child, depth + 1, maxDepth));

  return {
    id: node.id,
    name: node.name,
    type: node.type as DesignNode["type"],
    bounds: normalizeBounds(node),
    visible: typeof node.visible === "boolean" ? node.visible : undefined,
    opacity: typeof node.opacity === "number" ? node.opacity : undefined,
    fills,
    strokes,
    effects: Array.isArray(node.effects) ? node.effects : undefined,
    text: typeof node.characters === "string" ? node.characters : null,
    textStyle,
    layout,
    component,
    styles: {
      childCount: children.length,
      fillCount: fills?.length ?? 0,
      strokeCount: strokes?.length ?? 0,
      hasText: typeof node.characters === "string" && node.characters.length > 0,
      layoutMode: layout?.layoutMode ?? "NONE",
      fontFamily: textStyle?.fontName ?? null,
      componentId: component?.componentId ?? null,
    },
    children,
  };
}

export function createDesignSnapshot(
  tenantId: string,
  projectId: string,
  figmaFileId: string,
  schemaVersion: string,
  nodes: FigmaLikeNode[]
): DesignSnapshotPayload {
  const metadata: SnapshotMetadata = {
    payloadVersion: "1.0.0",
    schemaVersion,
    capturedAt: new Date().toISOString(),
    producer: `figma-plugin@${PLUGIN_VERSION}`,
  };

  return {
    tenantId,
    projectId,
    figmaFileId,
    metadata,
    nodes: nodes.map((node) => extractDesignNode(node)),
  };
}
