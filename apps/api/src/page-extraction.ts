import * as cheerio from "cheerio";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import type { PageCaptureSettings, PageElementSnapshot, PageSnapshotPayload } from "@d2p/shared";
import type { Element } from "domhandler";

export interface PageSnapshotExtractionInput {
  tenantId: string;
  projectId: string;
  pageUrl: string;
  schemaVersion?: string;
  capture?: PageCaptureSettings;
}

const CAPTURED_STYLE_KEYS = new Set([
  "position",
  "left",
  "top",
  "right",
  "bottom",
  "width",
  "height",
  "display",
  "visibility",
  "opacity",
  "background-color",
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "text-align",
  "border-radius",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "flex-direction",
  "align-items",
  "justify-content",
]);

const TEXT_TAGS = new Set([
  "span",
  "p",
  "a",
  "label",
  "li",
  "small",
  "strong",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

interface NodeKeyState {
  next: number;
}

function parseLength(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseStyle(styleText: string | undefined): Record<string, string> {
  if (!styleText) {
    return {};
  }

  const styles: Record<string, string> = {};

  for (const declaration of styleText.split(";")) {
    const [rawKey, ...rawValue] = declaration.split(":");

    if (!rawKey || rawValue.length === 0) {
      continue;
    }

    const key = rawKey.trim().toLowerCase();
    const value = rawValue.join(":").trim();

    if (!key || !value || !CAPTURED_STYLE_KEYS.has(key)) {
      continue;
    }

    styles[key] = value;
  }

  return styles;
}

function parseBox(styles: Record<string, string>): PageElementSnapshot["box"] {
  const left = parseLength(styles.left) ?? 0;
  const top = parseLength(styles.top) ?? 0;
  const width = parseLength(styles.width) ?? 0;
  const height = parseLength(styles.height) ?? 0;

  return {
    x: left,
    y: top,
    width,
    height,
  };
}

function isVisible(styles: Record<string, string>): boolean {
  if (styles.display === "none") {
    return false;
  }

  if (styles.visibility === "hidden") {
    return false;
  }

  const opacity = parseLength(styles.opacity);

  if (isFiniteNumber(opacity) && opacity <= 0) {
    return false;
  }

  return true;
}

function shouldCaptureText(tagName: string, text: string, hasElementChildren: boolean): boolean {
  if (hasElementChildren) {
    return false;
  }

  if (!text.trim()) {
    return false;
  }

  return TEXT_TAGS.has(tagName);
}

function createNodeKey(state: NodeKeyState): string {
  const key = `1:${state.next}`;
  state.next += 1;
  return key;
}

function readAttr(element: Element, name: string): string | null {
  const value = element.attribs?.[name];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeCaptureSettings(capture?: PageCaptureSettings): PageCaptureSettings | undefined {
  if (!capture) {
    return undefined;
  }

  const normalized: PageCaptureSettings = {};

  if (typeof capture.viewportWidth === "number" && Number.isFinite(capture.viewportWidth)) {
    normalized.viewportWidth = capture.viewportWidth;
  }

  if (typeof capture.viewportHeight === "number" && Number.isFinite(capture.viewportHeight)) {
    normalized.viewportHeight = capture.viewportHeight;
  }

  if (typeof capture.deviceScaleFactor === "number" && Number.isFinite(capture.deviceScaleFactor)) {
    normalized.deviceScaleFactor = capture.deviceScaleFactor;
  }

  if (typeof capture.userAgent === "string" && capture.userAgent.trim()) {
    normalized.userAgent = capture.userAgent.trim();
  }

  if (typeof capture.isMobile === "boolean") {
    normalized.isMobile = capture.isMobile;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

async function resolveChromiumExecutablePath(): Promise<string | undefined> {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
  const browsersDir = path.join(rootDir, ".playwright-browsers");

  try {
    const entries = await fs.readdir(browsersDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const candidateBase = path.join(browsersDir, entry.name);
      const headlessShellPath = path.join(
        candidateBase,
        "chrome-headless-shell-win64",
        "chrome-headless-shell.exe"
      );
      const chromePath = path.join(candidateBase, "chrome-win64", "chrome.exe");

      try {
        await fs.access(headlessShellPath);
        return headlessShellPath;
      } catch {
        // continue
      }

      try {
        await fs.access(chromePath);
        return chromePath;
      } catch {
        // continue
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function extractNode($: cheerio.CheerioAPI, element: Element, state: NodeKeyState): PageElementSnapshot {
  const tagName = element.tagName.toLowerCase();
  const styles = parseStyle($(element).attr("style"));
  const role = readAttr(element, "role");
  const ariaLabel = readAttr(element, "aria-label");
  const placeholder = readAttr(element, "placeholder");
  const inputType = readAttr(element, "type");
  const href = readAttr(element, "href");
  const key = createNodeKey(state);
  const children = $(element)
    .children()
    .toArray()
    .map((child) => extractNode($, child, state));
  const rawText = $(element).text().replace(/\s+/g, " ").trim();
  const text = shouldCaptureText(tagName, rawText, children.length > 0) ? rawText : null;

  return {
    key,
    tagName,
    text,
    box: parseBox(styles),
    visible: isVisible(styles),
    role,
    ariaLabel,
    placeholder,
    inputType,
    href,
    styles,
    children,
  };
}

export function extractPageSnapshotFromHtml(
  html: string,
  input: PageSnapshotExtractionInput
): PageSnapshotPayload {
  const $ = cheerio.load(html);
  const state: NodeKeyState = { next: 1 };
  const bodyChildren = $("body")
    .children()
    .toArray()
    .map((element) => extractNode($, element, state));

  return {
    tenantId: input.tenantId,
    projectId: input.projectId,
    pageUrl: input.pageUrl,
    schemaVersion: input.schemaVersion ?? "1.0.0",
    roots: bodyChildren,
  };
}

export async function extractPageSnapshotFromBrowser(
  pageUrl: string,
  input: Omit<PageSnapshotExtractionInput, "pageUrl">
): Promise<PageSnapshotPayload> {
  const executablePath = await resolveChromiumExecutablePath();
  const capture = normalizeCaptureSettings(input.capture);
  const browser = await chromium.launch({ headless: true, executablePath });

  try {
    const context = await browser.newContext({
      viewport: {
        width: capture?.viewportWidth ?? 1440,
        height: capture?.viewportHeight ?? 1024,
      },
      deviceScaleFactor: capture?.deviceScaleFactor ?? 1,
      userAgent: capture?.userAgent,
      isMobile: capture?.isMobile ?? false,
    });
    const page = await context.newPage();
    await page.goto(pageUrl, { waitUntil: "networkidle" });

    const roots = await page.evaluate(() => {
      const captureStyleKeys = [
        "position",
        "left",
        "top",
        "right",
        "bottom",
        "width",
        "height",
        "display",
        "visibility",
        "opacity",
        "background-color",
        "color",
        "font-family",
        "font-size",
        "font-weight",
        "line-height",
        "text-align",
        "border-radius",
        "padding",
        "padding-top",
        "padding-right",
        "padding-bottom",
        "padding-left",
        "margin",
        "margin-top",
        "margin-right",
        "margin-bottom",
        "margin-left",
        "flex-direction",
        "align-items",
        "justify-content",
      ];

      const textTags = new Set([
        "span",
        "p",
        "a",
        "label",
        "li",
        "small",
        "strong",
        "em",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
      ]);

      let next = 1;

      const normalizeText = (value: string | null | undefined): string | null => {
        if (value === null || value === undefined) {
          return null;
        }

        const normalized = value.replace(/\s+/g, " ").trim();

        return normalized.length > 0 ? normalized : null;
      };

      const createNodeKey = (): string => {
        const key = `1:${next}`;
        next += 1;
        return key;
      };

      const extractNode = (element: Element): PageElementSnapshot => {
        const computedStyle = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const styles: Record<string, string> = {};
        const key = createNodeKey();
        const role = element.getAttribute("role");
        const ariaLabel = element.getAttribute("aria-label");
        const placeholder = (element as HTMLInputElement | HTMLTextAreaElement).placeholder || element.getAttribute("placeholder");
        const inputType = (element as HTMLInputElement).type || element.getAttribute("type");
        const href = (element as HTMLAnchorElement).href || element.getAttribute("href");

        for (const styleKey of captureStyleKeys) {
          const value = computedStyle.getPropertyValue(styleKey).trim();

          if (value) {
            styles[styleKey] = value;
          }
        }

        const children = Array.from(element.children).map((child) => extractNode(child));
        const text = normalizeText(element.textContent);
        const tagName = element.tagName.toLowerCase();
        const visible =
          computedStyle.display !== "none" &&
          computedStyle.visibility !== "hidden" &&
          Number.parseFloat(computedStyle.opacity || "1") > 0;

        return {
          key,
          tagName,
          text: text && children.length === 0 && textTags.has(tagName) ? text : null,
          box: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
          visible,
          role: role || null,
          ariaLabel: ariaLabel || null,
          placeholder: placeholder || null,
          inputType: inputType || null,
          href: href || null,
          styles,
          children,
        };
      };

      return Array.from(document.body?.children ?? []).map((element) => extractNode(element));
    });

    return {
      tenantId: input.tenantId,
      projectId: input.projectId,
      pageUrl,
      schemaVersion: input.schemaVersion ?? "1.0.0",
      capture,
      roots,
    };
  } finally {
    await browser.close();
  }
}

export async function extractPageSnapshotFromUrl(
  pageUrl: string,
  input: Omit<PageSnapshotExtractionInput, "pageUrl">
): Promise<PageSnapshotPayload> {
  const parsedUrl = new URL(pageUrl);

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("pageUrl must use http or https");
  }

  try {
    return await extractPageSnapshotFromBrowser(pageUrl, input);
  } catch {
    const response = await fetch(parsedUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch page: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();

    return extractPageSnapshotFromHtml(html, {
      tenantId: input.tenantId,
      projectId: input.projectId,
      pageUrl,
      schemaVersion: input.schemaVersion,
      capture: input.capture,
    });
  }
}
