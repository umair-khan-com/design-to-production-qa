import type {
  DesignNode,
  DesignSnapshotPayload,
  LayoutSnapshot,
  PaintSummary,
  RGBAColor,
  TextStyleSnapshot,
} from "@d2p/shared";

interface FigmaBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FigmaPaint {
  type: string;
  color?: RGBAColor;
  opacity?: number;
  visible?: boolean;
  blendMode?: string;
  imageHash?: string;
}

interface FigmaTextStyle {
  fontFamily?: string;
  fontName?: string;
  fontPostScriptName?: string;
  fontSize?: number;
  lineHeightPx?: number;
  letterSpacing?: number;
  textCase?: string;
  textDecoration?: string;
  paragraphIndent?: number;
  paragraphSpacing?: number;
  textAlignHorizontal?: string;
  textAlignVertical?: string;
}

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  opacity?: number;
  absoluteBoundingBox?: FigmaBoundingBox;
  absoluteRenderBounds?: FigmaBoundingBox;
  fills?: FigmaPaint[] | string;
  strokes?: FigmaPaint[] | string;
  effects?: Array<Record<string, unknown>> | string;
  characters?: string;
  style?: FigmaTextStyle;
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
  componentProperties?: Record<string, unknown>;
  variantProperties?: Record<string, string>;
  styles?: Record<string, unknown>;
  children?: FigmaNode[];
}

interface FigmaFileResponse {
  document: FigmaNode;
  name?: string;
  lastModified?: string;
  version?: string;
}

interface FigmaNodesResponse {
  nodes: Record<
    string,
    {
      document?: FigmaNode | null;
    } | null
  >;
}

interface FigmaImagesResponse {
  images: Record<string, string | null>;
}

export interface ParsedFigmaUrl {
  fileKey: string;
  nodeId?: string;
}

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

function parseBox(node: FigmaNode): FigmaBoundingBox {
  return node.absoluteBoundingBox ?? node.absoluteRenderBounds ?? { x: 0, y: 0, width: 0, height: 0 };
}

function normalizeNodeType(node: FigmaNode): DesignNode["type"] {
  if (SUPPORTED_NODE_TYPES.has(node.type as DesignNode["type"])) {
    return node.type as DesignNode["type"];
  }

  if (node.type === "SECTION" || node.type === "PAGE" || node.type === "CANVAS" || node.type === "DOCUMENT") {
    return "FRAME";
  }

  if (node.type === "STAR") {
    return "VECTOR";
  }

  return node.children?.length ? "FRAME" : "RECTANGLE";
}

function convertPaints(paints: FigmaNode["fills"] | FigmaNode["strokes"]): PaintSummary[] {
  if (!Array.isArray(paints)) {
    return [];
  }

  return paints
    .filter((paint): paint is FigmaPaint => typeof paint === "object" && paint !== null)
    .map((paint) => ({
      type: paint.type,
      color: paint.color,
      opacity: paint.opacity,
      visible: paint.visible,
      blendMode: paint.blendMode,
      imageHash: paint.imageHash,
    }));
}

function convertTextStyle(node: FigmaNode): TextStyleSnapshot | undefined {
  if (node.type !== "TEXT" || !node.style) {
    return undefined;
  }

  return {
    fontName: node.style.fontFamily ?? node.style.fontName ?? node.style.fontPostScriptName,
    fontSize: node.style.fontSize,
    lineHeight: node.style.lineHeightPx,
    letterSpacing: node.style.letterSpacing,
    textCase: node.style.textCase,
    textDecoration: node.style.textDecoration,
    paragraphIndent: node.style.paragraphIndent,
    paragraphSpacing: node.style.paragraphSpacing,
    textAlignHorizontal: node.style.textAlignHorizontal,
    textAlignVertical: node.style.textAlignVertical,
  };
}

function convertLayout(node: FigmaNode): LayoutSnapshot | undefined {
  if (
    node.layoutMode === undefined &&
    node.primaryAxisSizingMode === undefined &&
    node.counterAxisSizingMode === undefined &&
    node.primaryAxisAlignItems === undefined &&
    node.counterAxisAlignItems === undefined &&
    node.itemSpacing === undefined &&
    node.paddingTop === undefined &&
    node.paddingRight === undefined &&
    node.paddingBottom === undefined &&
    node.paddingLeft === undefined &&
    node.strokeAlign === undefined &&
    node.cornerRadius === undefined
  ) {
    return undefined;
  }

  return {
    layoutMode: node.layoutMode,
    primaryAxisSizingMode: node.primaryAxisSizingMode,
    counterAxisSizingMode: node.counterAxisSizingMode,
    primaryAxisAlignItems: node.primaryAxisAlignItems,
    counterAxisAlignItems: node.counterAxisAlignItems,
    itemSpacing: node.itemSpacing,
    paddingTop: node.paddingTop,
    paddingRight: node.paddingRight,
    paddingBottom: node.paddingBottom,
    paddingLeft: node.paddingLeft,
    strokeAlign: node.strokeAlign,
    cornerRadius: typeof node.cornerRadius === "number" ? node.cornerRadius : undefined,
  };
}

function convertComponent(node: FigmaNode): DesignNode["component"] {
  const componentProperties = node.componentProperties
    ? Object.fromEntries(Object.entries(node.componentProperties).map(([key, value]) => [key, String(value)]))
    : {};

  return {
    componentId: node.componentId,
    componentProperties,
    variantProperties: node.variantProperties ?? {},
  };
}

function convertNode(
  node: FigmaNode,
  mediaByNodeId: Map<string, { imageUrl?: string; imageBase64?: string }>
): DesignNode {
  const bounds = parseBox(node);
  const children = (node.children ?? []).map((child) => convertNode(child, mediaByNodeId));
  const media = mediaByNodeId.get(node.id);

  return {
    id: node.id,
    name: node.name,
    type: normalizeNodeType(node),
    bounds: {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    },
    visible: node.visible ?? true,
    opacity: node.opacity ?? 1,
    fills: convertPaints(node.fills),
    strokes: convertPaints(node.strokes),
    effects: Array.isArray(node.effects) ? node.effects : [],
    text: node.type === "TEXT" ? (node.characters?.trim() ? node.characters.trim() : null) : null,
    textStyle: convertTextStyle(node),
    layout: convertLayout(node),
    component: convertComponent(node),
    media,
    styles: {
      childCount: children.length,
      fillCount: Array.isArray(node.fills) ? node.fills.length : 0,
      strokeCount: Array.isArray(node.strokes) ? node.strokes.length : 0,
      hasText: node.type === "TEXT" && Boolean(node.characters?.trim()),
      layoutMode: node.layoutMode ?? "NONE",
      fontFamily: node.style?.fontFamily ?? node.style?.fontName ?? node.style?.fontPostScriptName ?? null,
      componentId: node.componentId ?? null,
    },
    children,
  };
}

function normalizeRootPageNode(
  page: FigmaNode,
  viewportWidth: number,
  viewportHeight: number,
  media?: { imageUrl?: string; imageBase64?: string }
): DesignNode {
  return {
    id: page.id,
    name: page.name,
    type: "FRAME",
    bounds: {
      x: 0,
      y: 0,
      width: viewportWidth,
      height: viewportHeight,
    },
    visible: true,
    opacity: 1,
    fills: [],
    strokes: [],
    effects: [],
    text: null,
    layout: {
      layoutMode: page.layoutMode,
      primaryAxisSizingMode: page.primaryAxisSizingMode,
      counterAxisSizingMode: page.counterAxisSizingMode,
      primaryAxisAlignItems: page.primaryAxisAlignItems,
      counterAxisAlignItems: page.counterAxisAlignItems,
      itemSpacing: page.itemSpacing,
      paddingTop: page.paddingTop,
      paddingRight: page.paddingRight,
      paddingBottom: page.paddingBottom,
      paddingLeft: page.paddingLeft,
      strokeAlign: page.strokeAlign,
      cornerRadius: typeof page.cornerRadius === "number" ? page.cornerRadius : undefined,
    },
    component: {},
    media,
    styles: {
      childCount: page.children?.length ?? 0,
      fillCount: 0,
      strokeCount: 0,
      hasText: false,
      layoutMode: page.layoutMode ?? "NONE",
      fontFamily: null,
      componentId: null,
      sourceType: page.type,
    },
    children: [],
  };
}

function parseNodeIdFromUrl(url: URL): string | undefined {
  return url.searchParams.get("node-id") ?? url.searchParams.get("nodeId") ?? undefined;
}

export function parseFigmaUrl(url: string): ParsedFigmaUrl {
  const trimmed = url.trim();
  const match = trimmed.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/i);

  if (!match) {
    throw new Error("Invalid Figma URL. Please paste a valid design link.");
  }

  let nodeId: string | undefined;

  try {
    nodeId = parseNodeIdFromUrl(new URL(trimmed));
  } catch {
    nodeId = undefined;
  }

  return {
    fileKey: match[1],
    nodeId,
  };
}

function resolveFigmaToken(): string {
  const token = process.env.FIGMA_ACCESS_TOKEN?.trim();

  if (!token) {
    throw new Error("Figma is not connected. Please add FIGMA_ACCESS_TOKEN in .env");
  }

  return token;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJsonWithRetry<T>(url: string, init: RequestInit = {}, attempts = 4): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(url, init);

    if (response.ok) {
      return (await response.json()) as T;
    }

    const details = await response.text().catch(() => "");
    const message = `Failed to fetch Figma resource: ${response.status} ${response.statusText}${details ? ` - ${details}` : ""}`;

    if (response.status === 429 && attempt < attempts) {
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterSeconds = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : Number.NaN;
      const backoffMs =
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : Math.min(1000 * 2 ** (attempt - 1), 8000);

      lastError = new Error(message);
      await sleep(backoffMs);
      continue;
    }

    if (response.status === 401) {
      throw new Error(`Figma authentication failed: ${details || response.statusText}`);
    }

    if (response.status === 403) {
      throw new Error(`Figma access denied: ${details || response.statusText}`);
    }

    if (response.status === 404) {
      throw new Error(`Figma resource not found: ${details || response.statusText}`);
    }

    throw new Error(message);
  }

  throw lastError ?? new Error("Failed to fetch Figma resource");
}

class FigmaService {
  private readonly token = resolveFigmaToken();
  private readonly fileCache = new Map<string, Promise<FigmaFileResponse>>();
  private readonly nodeCache = new Map<string, Promise<FigmaNode>>();
  private readonly imageCache = new Map<string, Promise<Record<string, string | null>>>();

  async extractFile(fileKey: string, nodeId?: string): Promise<FigmaNode> {
    if (nodeId) {
      const cacheKey = `${fileKey}::${nodeId}`;
      const existingNode = this.nodeCache.get(cacheKey);
      if (existingNode) {
        return existingNode;
      }

      const nodePromise = requestJsonWithRetry<FigmaNodesResponse>(
        `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`,
        {
          headers: {
            "X-Figma-Token": this.token,
          },
        }
      ).then((response) => {
        const node = response.nodes[nodeId]?.document ?? null;

        if (!node) {
          throw new Error(`Figma node not found: ${nodeId}`);
        }

        return node;
      });

      this.nodeCache.set(cacheKey, nodePromise);
      return nodePromise;
    }

    const existingFile = this.fileCache.get(fileKey);
    if (existingFile) {
      const file = await existingFile;
      return file.document;
    }

    const filePromise = requestJsonWithRetry<FigmaFileResponse>(`https://api.figma.com/v1/files/${fileKey}`, {
      headers: {
        "X-Figma-Token": this.token,
      },
    });
    this.fileCache.set(fileKey, filePromise);

    const file = await filePromise;
    return file.document;
  }

  async getNodeImages(fileKey: string, nodeIds: string[], format: "png" | "jpg" = "png"): Promise<Record<string, string | null>> {
    if (nodeIds.length === 0) {
      return {};
    }

    const cacheKey = `${fileKey}::${format}::${nodeIds.slice().sort().join(",")}`;
    const existing = this.imageCache.get(cacheKey);
    if (existing) {
      return existing;
    }

    const promise = requestJsonWithRetry<FigmaImagesResponse>(
      `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeIds.join(","))}&format=${format}`,
      {
        headers: {
          "X-Figma-Token": this.token,
        },
      }
    ).then((response) => response.images);

    this.imageCache.set(cacheKey, promise);
    return promise;
  }

  async getNodeImageBase64(imageUrl: string): Promise<string> {
    const response = await fetch(imageUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch Figma image: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") ?? "image/png";
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:${contentType};base64,${base64}`;
  }
}

function collectImageCandidateIds(node: FigmaNode, acc: string[] = [], limit = 20): string[] {
  if (acc.length >= limit) {
    return acc;
  }

  const hasImageFill = Array.isArray(node.fills)
    ? node.fills.some((paint) => typeof paint === "object" && paint !== null && (paint as FigmaPaint).imageHash)
    : false;
  const isVisualNode = ["IMAGE", "RECTANGLE", "VECTOR", "FRAME", "INSTANCE", "COMPONENT"].includes(node.type);

  if ((hasImageFill || node.type === "IMAGE" || node.type === "RECTANGLE") && isVisualNode) {
    acc.push(node.id);
  }

  for (const child of node.children ?? []) {
    if (acc.length >= limit) {
      break;
    }

    collectImageCandidateIds(child, acc, limit);
  }

  return acc;
}

async function buildNodeMediaMap(fileKey: string, root: FigmaNode): Promise<Map<string, { imageUrl?: string; imageBase64?: string }>> {
  const candidateIds = collectImageCandidateIds(root);
  const service = new FigmaService();
  const images = await service.getNodeImages(fileKey, candidateIds);
  const mediaByNodeId = new Map<string, { imageUrl?: string; imageBase64?: string }>();

  for (const [nodeId, imageUrl] of Object.entries(images)) {
    if (!imageUrl) {
      continue;
    }

    mediaByNodeId.set(nodeId, {
      imageUrl,
    });
  }

  return mediaByNodeId;
}

export async function extractFile(fileKey: string, nodeId?: string): Promise<FigmaNode> {
  const service = new FigmaService();
  return service.extractFile(fileKey, nodeId);
}

export async function getNodeImage(fileKey: string, nodeId: string): Promise<string | null> {
  const service = new FigmaService();
  const images = await service.getNodeImages(fileKey, [nodeId]);
  const imageUrl = images[nodeId];

  if (!imageUrl) {
    return null;
  }

  return service.getNodeImageBase64(imageUrl);
}

export async function getNodesImages(fileKey: string, nodeIds: string[]): Promise<Record<string, string | null>> {
  const service = new FigmaService();
  return service.getNodeImages(fileKey, nodeIds);
}

export async function getNodeImageBase64(imageUrl: string): Promise<string> {
  const service = new FigmaService();
  return service.getNodeImageBase64(imageUrl);
}

export function traverseNodes(node: FigmaNode, visit: (current: FigmaNode) => void): void {
  visit(node);
  for (const child of node.children ?? []) {
    traverseNodes(child, visit);
  }
}

export function normalizeNode(node: FigmaNode): DesignNode {
  return convertNode(node, new Map());
}

export async function buildDesignSnapshotFromFigmaUrl(input: {
  tenantId: string;
  projectId: string;
  figmaUrl: string;
  viewportWidth: number;
  viewportHeight: number;
}): Promise<DesignSnapshotPayload> {
  const { fileKey, nodeId } = parseFigmaUrl(input.figmaUrl);
  const fileDocument = await extractFile(fileKey, nodeId);
  const mediaByNodeId = await buildNodeMediaMap(fileKey, fileDocument);
  const page =
    nodeId
      ? fileDocument
      : (fileDocument.children ?? []).find((child) => Array.isArray(child.children) && child.children.length > 0) ??
        fileDocument.children?.[0] ??
        fileDocument;

  const rootNode = normalizeRootPageNode(page, input.viewportWidth, input.viewportHeight, mediaByNodeId.get(page.id));
  rootNode.children = (page.children ?? []).map((child) => convertNode(child, mediaByNodeId));
  const nodes = [rootNode];

  return {
    tenantId: input.tenantId,
    projectId: input.projectId,
    figmaFileId: fileKey,
    metadata: {
      payloadVersion: "1.0.0",
      schemaVersion: "1.0.0",
      capturedAt: new Date().toISOString(),
      producer: nodeId ? `figma-api@1.0.0#${nodeId}` : "figma-api@1.0.0",
    },
    nodes,
  };
}
